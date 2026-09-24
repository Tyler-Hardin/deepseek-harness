plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Applied only when app/google-services.json exists: a checkout without the
// Firebase project still builds, it just has no push transport.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "ai.deepseek.dsh"
    compileSdk = 34

    // Debug builds are signed with a keystore kept outside the repository, so a
    // regenerated gradle home cannot change the app identity (which would break
    // in-place installs and the SHA-1 registered with Firebase). Fall back to
    // Gradle's own debug key when the pinned file is absent.
    val pinnedKeystore = file(
        System.getenv("DSH_ANDROID_KEYSTORE")
            ?: "${System.getProperty("user.home")}/.config/dsh-android/debug.keystore"
    )
    signingConfigs {
        if (pinnedKeystore.exists()) {
            create("pinnedDebug") {
                storeFile = pinnedKeystore
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }

    defaultConfig {
        applicationId = "ai.deepseek.dsh"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        getByName("debug") {
            if (pinnedKeystore.exists()) signingConfig = signingConfigs.getByName("pinnedDebug")
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // AndroidX core (NotificationCompat, ContextCompat) and appcompat
    // (AppCompatActivity, AlertDialog). Everything else is platform API.
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    // OkHttp: WebSocket downlinks + session.list seed for the background
    // task-completion monitor (DshNotificationService).
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // Push: the platform's own transport, so no listener or socket lives in the app.
    implementation(platform("com.google.firebase:firebase-bom:33.5.1"))
    implementation("com.google.firebase:firebase-messaging")
}
