{
  description = "dsh Android app — minimal WebView wrapper with mTLS client certificates";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config = {
            allowUnfree = true;
            android_sdk.accept_license = true;
          };
        };

        # Compose the Android SDK with the packages we need. Keep this
        # identical to the goop app's composition so the SDK derivation is
        # shared in the Nix store.
        androidComposition = pkgs.androidenv.composeAndroidPackages {
          platformVersions = [ "34" ];
          buildToolsVersions = [ "34.0.0" ];
          includeNDK = false;
          includeEmulator = true;
          includeSystemImages = true;
          systemImageTypes = [ "google_apis" ];
          abiVersions = [ "x86_64" ];
          includeSources = false;
        };

        androidSdk = androidComposition.androidsdk;
        ANDROID_HOME = "${androidSdk}/libexec/android-sdk";
      in
      {
        # The dev shell is the recommended way to build — it has network
        # access so Gradle can fetch dependencies.
        devShells.default = pkgs.mkShell {
          name = "dsh-android-dev";

          nativeBuildInputs = with pkgs; [
            androidSdk
            gradle
            jdk17
            android-tools
          ];

          # Create a writable ANDROID_HOME by symlinking the read-only
          # Nix store SDK and dropping in a license file.
          shellHook = ''
            export GRADLE_USER_HOME="$PWD/.gradle-home"
            # Keep the debug keystore and AVD state inside the project so
            # builds work even when $HOME/.android is not writable (e.g. a
            # build sandbox).
            export ANDROID_USER_HOME="$PWD/.android-user-home"

            WRITABLE_SDK="$PWD/.android-sdk"
            if [ ! -d "$WRITABLE_SDK" ]; then
              mkdir -p "$WRITABLE_SDK"
              for dir in platforms build-tools platform-tools tools cmake emulator system-images; do
                if [ -d "${ANDROID_HOME}/$dir" ]; then
                  ln -sf "${ANDROID_HOME}/$dir" "$WRITABLE_SDK/$dir"
                fi
              done
            fi

            # Accept licenses.
            mkdir -p "$WRITABLE_SDK/licenses"
            if [ ! -f "$WRITABLE_SDK/licenses/android-sdk-license" ]; then
              echo -e "\n24333f8a63b6825ea9c5514f83c2829b004d1fee" \
                > "$WRITABLE_SDK/licenses/android-sdk-license"
            fi

            export ANDROID_HOME="$WRITABLE_SDK"
            export ANDROID_SDK_ROOT="$WRITABLE_SDK"

            echo "dsh Android dev shell"
            echo "  ANDROID_HOME=$ANDROID_HOME"
            echo ""
            echo "  Build:     gradle assembleDebug"
            echo "  Install:   adb install app/build/outputs/apk/debug/app-debug.apk"
            echo ""
            echo "  First-run (create an emulator):"
            echo "    avdmanager create avd -n dsh_emu -k \"system-images;android-34;google_apis;x86_64\" -d pixel_6"
            echo "    emulator -avd dsh_emu -no-audio -gpu swiftshader_indirect &"
            echo "    adb wait-for-device"
            echo ""
            echo "  Logs:      adb logcat -s DshMain:V DshApp:V DshJsBridge:V DshConsole:V"
          '';
        };
      }
    );
}
