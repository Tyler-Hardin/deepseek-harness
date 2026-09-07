plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ai.deepseek.dsh"
    compileSdk = 34

    defaultConfig {
        applicationId = "ai.deepseek.dsh"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
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
}
