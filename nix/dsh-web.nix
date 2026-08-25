{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.dsh-web;

  # Render one ExecStart= line. NixOS writes each element of a *list*
  # serviceConfig value as its own directive, and systemd only allows several
  # ExecStart= lines for Type=oneshot units — a Type=simple unit would fail to
  # load with "bad unit file setting". The escaping mirrors NixOS' internal
  # escapeSystemdExecArgs (nixos/lib/utils.nix): quote with JSON and double
  # "%"/"$" so systemd does not expand specifiers or variables.
  escapeSystemdExecArgs =
    args:
    lib.concatMapStringsSep " " (
      arg:
      lib.replaceStrings
        [
          "%"
          "$"
        ]
        [
          "%%"
          "$$"
        ]
        (builtins.toJSON arg)
    ) args;
in
{
  options.services.dsh-web = {
    enable = lib.mkEnableOption "the DeepSeek Harness web UI (dsh web)";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.dsh;
      defaultText = lib.literalExpression "pkgs.dsh";
      description = ''
        The dsh app package, including its built web frontend. The flake's
        `nixosModules.default` pre-wires `packages.<system>.dsh` (built from
        the repository); set explicitly to use a different build.
      '';
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "dsh";
      description = ''
        System user the service runs as. Run it as your own user to share
        that user's `~/.dsh` (settings, credentials, sessions) with your CLI
        usage; the service then behaves exactly like `dsh web` started from a
        terminal by that user.
      '';
    };

    group = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = ''
        Group the service runs as. `null` lets systemd use the user's primary
        group.
      '';
    };

    workingDir = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = ''
        Working directory of the service process. The invoking directory is
        the web UI's default workspace root, so this is also the default
        workspace offered to new sessions. Defaults to the run user's home
        (`users.users.<name>.home`); set it explicitly when the user is not
        declared in `users.users`.
      '';
    };

    dshHome = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = ''
        `$DSH_HOME` for the service. `null` leaves the variable unset, so the
        harness resolves its home as `~/.dsh` of the run user — the same
        settings, credentials, sessions, and default model as that user's CLI.
        Set it to run the service against a dedicated home instead.
      '';
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = ''
        Bind host for the web server. dsh itself refuses `0.0.0.0` for safety
        (the UI is a remote code execution surface); expose it to a network
        through a reverse proxy instead.
      '';
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3080;
      description = "Listen port. `0` lets the operating system pick a free one.";
    };

    trustedHosts = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      description = ''
        Extra authorities the `/api` browser-trust fence accepts
        (`host` or `host:port`); passed as repeatable `--trusted-host`.
      '';
    };

    environment = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = { };
      description = ''
        Extra environment variables for the service, e.g.
        `DEEPSEEK_API_KEY` (when not relying on the credentials file),
        `DSH_TELEMETRY_DISABLED = "1"`, or `HTTP_PROXY`/`HTTPS_PROXY`.
      '';
    };

    extraArgs = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      description = ''
        Extra arguments appended to the `dsh web` invocation. Elements are
        passed as single arguments; whitespace and other special characters
        are escaped for systemd.
      '';
    };

    inheritSystemPath = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Prepend the system profile (environment.systemPackages) to the
        service PATH. Agent bash commands run in a sandbox that inherits
        the service environment; with this off, host tools such as git,
        node, or curl resolve only by absolute path.
      '';
    };

    extraPackages = lib.mkOption {
      type = lib.types.listOf lib.types.package;
      default = [ ];
      description = ''
        Packages whose bin and sbin directories are added to the service
        PATH after the system profile when inheritSystemPath is enabled.
        Select specific tools for deployments that disable
        inheritSystemPath instead of inheriting the whole system profile.
      '';
    };

    voiceContext = lib.mkOption {
      type = lib.types.nullOr lib.types.package;
      default = null;
      description = ''
        Python environment providing the local speech-to-text backend for
        Voice-Context (the `/voice-local` server). When set, its bin is
        added to the service PATH so `python -m uvicorn` resolves without a
        pip install. Build it with `nix build .#dsh-stt` (faster-whisper
        path) or point it at any python env providing fastapi, uvicorn, and
        faster-whisper. `null` leaves the backend to the pip-based
        `/voice-local install` flow; the funasr/SenseVoiceSmall engine is
        not packaged in nixpkgs and keeps that flow regardless.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.dsh-web = {
      description = "DeepSeek Harness web UI";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];
      environment =
        (lib.optionalAttrs (cfg.dshHome != null) { DSH_HOME = toString cfg.dshHome; }) // cfg.environment;
      path =
        (if cfg.inheritSystemPath then [ config.system.path ] else [ ])
        ++ cfg.extraPackages
        ++ lib.optional (cfg.voiceContext != null) cfg.voiceContext;
      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = lib.mkIf (cfg.group != null) cfg.group;
        # --no-open is unconditional: a service must never hand off to a browser.
        ExecStart = escapeSystemdExecArgs (
          [
            "${cfg.package}/bin/dsh"
            "web"
            "--no-open"
            "--host"
            cfg.host
            "--port"
            (toString cfg.port)
          ]
          ++ lib.concatMap (host: [
            "--trusted-host"
            host
          ]) cfg.trustedHosts
          ++ cfg.extraArgs
        );
        WorkingDirectory =
          if cfg.workingDir != null then cfg.workingDir else config.users.users.${cfg.user}.home;
        Restart = "on-failure";
        RestartSec = 2;
      };
    };
  };
}
