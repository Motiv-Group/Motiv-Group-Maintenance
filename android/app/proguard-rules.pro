# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ── Capacitor / WebView keep-rules (required once minifyEnabled=true) ──────────
# Keep annotations — Capacitor plugins are discovered via @CapacitorPlugin.
-keepattributes *Annotation*, JavascriptInterface

# Capacitor core + all plugins (reflection + JS bridge).
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }

# Cordova plugins bridged through Capacitor.
-keep class org.apache.cordova.** { *; }

# Anything exposed to WebView JavaScript.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# This app's own package.
-keep class com.motiv.app.** { *; }

