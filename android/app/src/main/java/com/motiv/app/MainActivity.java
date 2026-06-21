package com.motiv.app;

import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.view.animation.AlphaAnimation;
import android.view.animation.Animation;
import android.widget.ImageView;
import android.content.SharedPreferences;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Rotating city splash images (added as res/drawable/splash_city{1..4}.png).
    private static final int[] CITY = {
        R.drawable.splash_city1,
        R.drawable.splash_city2,
        R.drawable.splash_city3,
        R.drawable.splash_city4,
    };
    private static final long SHOW_MS = 2500;
    private static final long FADE_MS = 500;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Full-screen city image over the webview while the site loads. A random
        // one per launch (never the same twice in a row), navy behind, then it
        // fades out to reveal the app.
        final ImageView splash = new ImageView(this);
        splash.setScaleType(ImageView.ScaleType.CENTER_CROP);
        splash.setBackgroundColor(Color.parseColor("#0A0E17"));
        splash.setImageResource(pickCity());
        addContentView(splash, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            AlphaAnimation fade = new AlphaAnimation(1f, 0f);
            fade.setDuration(FADE_MS);
            fade.setFillAfter(true);
            fade.setAnimationListener(new Animation.AnimationListener() {
                @Override public void onAnimationStart(Animation a) {}
                @Override public void onAnimationRepeat(Animation a) {}
                @Override public void onAnimationEnd(Animation a) {
                    ViewGroup parent = (ViewGroup) splash.getParent();
                    if (parent != null) parent.removeView(splash);
                }
            });
            splash.startAnimation(fade);
        }, SHOW_MS);
    }

    // Random index, avoiding an immediate repeat across launches.
    private int pickCity() {
        SharedPreferences sp = getSharedPreferences("motiv", MODE_PRIVATE);
        int last = sp.getInt("lastSplash", -1);
        int idx;
        do {
            idx = (int) (Math.random() * CITY.length);
        } while (CITY.length > 1 && idx == last);
        sp.edit().putInt("lastSplash", idx).apply();
        return CITY[idx];
    }
}
