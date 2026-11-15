package com.minglebooth.mobile.plugins;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.util.Log;
import androidx.print.PrintHelper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;

@CapacitorPlugin(name = "AndroidPrint")
public class AndroidPrintPlugin extends Plugin {
    private static final String TAG = "AndroidPrintPlugin";

    @PluginMethod
    public void printImage(PluginCall call) {
        String dataUrl = call.getString("photoDataUrl");
        String filePath = call.getString("filePath");
        String jobName = call.getString("jobName", "MingleBooth_Print");
        String scaleMode = call.getString("scaleMode", "fit");

        try {
            Bitmap bitmap = null;
            if (dataUrl != null && dataUrl.contains(",")) {
                String base64Data = dataUrl.substring(dataUrl.indexOf(",") + 1);
                byte[] decodedBytes = Base64.decode(base64Data, Base64.DEFAULT);
                bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.length);
            } else if (filePath != null) {
                File f = new File(filePath);
                if (f.exists()) {
                    bitmap = BitmapFactory.decodeStream(new FileInputStream(f));
                }
            }

            if (bitmap == null) {
                call.reject("Berkas gambar cetak tidak valid atau kosong");
                return;
            }

            final Bitmap finalBitmap = bitmap;
            getActivity().runOnUiThread(() -> {
                try {
                    PrintHelper printHelper = new PrintHelper(getActivity());
                    printHelper.setScaleMode("fill".equalsIgnoreCase(scaleMode)
                            ? PrintHelper.SCALE_MODE_FILL
                            : PrintHelper.SCALE_MODE_FIT);
                    printHelper.setColorMode(PrintHelper.COLOR_MODE_COLOR);

                    printHelper.printBitmap(jobName, finalBitmap, () -> {
                        Log.i(TAG, "Pekerjaan cetak selesai diterima oleh Android Print Framework");
                    });

                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("message", "Pekerjaan cetak diterima oleh Android Print Framework");
                    call.resolve(ret);
                } catch (Throwable e) {
                    Log.e(TAG, "Error invoking Android PrintHelper: " + e.getMessage(), e);
                    call.reject("Gagal memanggil Android Print: " + e.getMessage());
                }
            });
        } catch (Throwable t) {
            Log.e(TAG, "Exception decoding image for print: " + t.getMessage(), t);
            call.reject("Gagal menyiapkan gambar cetak: " + t.getMessage());
        }
    }
}
