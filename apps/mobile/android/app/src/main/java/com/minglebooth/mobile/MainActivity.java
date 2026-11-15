package com.minglebooth.mobile;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.minglebooth.mobile.plugins.SonyDirectCameraPlugin;
import com.minglebooth.mobile.plugins.AndroidPrintPlugin;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SonyDirectCameraPlugin.class);
        registerPlugin(AndroidPrintPlugin.class);
        super.onCreate(savedInstanceState);
        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                WebView webView = this.bridge.getWebView();
                webView.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            }
        } catch (Throwable e) {
            Log.w(TAG, "Failed to set mixed content mode: " + e.getMessage());
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Log.i(TAG, "onNewIntent received with action: " + (intent != null ? intent.getAction() : "null"));
    }

    @Override
    public void onConfigurationChanged(android.content.res.Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        Log.i(TAG, "[LIFECYCLE_ROTATION] onConfigurationChanged: orientation=" 
            + (newConfig.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE ? "LANDSCAPE" : "PORTRAIT")
            + ", screenWidthDp=" + newConfig.screenWidthDp + ", screenHeightDp=" + newConfig.screenHeightDp);
    }
}
