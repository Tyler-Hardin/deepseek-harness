// Top-level build configuration
plugins {
    id("com.android.application") version "8.2.0" apply false
    id("org.jetbrains.kotlin.android") version "1.9.22" apply false
    // Firebase Cloud Messaging: push replaces the foreground socket monitor
    // when the deployment has a Firebase project (see app/build.gradle.kts).
    id("com.google.gms.google-services") version "4.4.2" apply false
}
