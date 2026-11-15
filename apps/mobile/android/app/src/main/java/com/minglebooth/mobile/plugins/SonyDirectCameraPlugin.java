package com.minglebooth.mobile.plugins;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * SonyDirectCameraPlugin - Capacitor 6 Plugin for Standalone Direct USB Sony Alpha Cameras.
 * 
 * Interacts directly with Sony A6400 (ILCE-6400) and Sony A7C II (ILCE-7CM2) via USB OTG cable.
 * Completely standalone: No PC, laptop, or Desktop Hub required.
 */
@CapacitorPlugin(name = "SonyDirectCamera")
public class SonyDirectCameraPlugin extends Plugin {
    private static final String TAG = "SonyDirectCameraPlugin";
    private static final String ACTION_USB_PERMISSION = "com.minglebooth.mobile.USB_PERMISSION";
    private static final int SONY_VENDOR_ID = 0x054C; // 1356 decimal

    private UsbManager usbManager;
    private SonyPtpDriver ptpDriver;
    private BroadcastReceiver usbReceiver;
    private PluginCall pendingPermissionCall;
    private UsbDevice pendingDevice;
    private final ExecutorService executor = Executors.newCachedThreadPool();

    @Override
    public void load() {
        super.load();
        try {
            Context context = getContext();
            usbManager = (UsbManager) context.getSystemService(Context.USB_SERVICE);
            ptpDriver = SonyPtpDriver.getInstance(context);

            registerUsbReceiver();
            Log.i(TAG, "[INIT] SonyDirectCameraPlugin loaded with retained SonyPtpDriver singleton.");
        } catch (Throwable t) {
            Log.e(TAG, "[INIT_ERROR] Error initializing SonyDirectCameraPlugin: " + t.getMessage(), t);
        }
    }

    private void registerUsbReceiver() {
        try {
            usbReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    try {
                        String action = intent != null ? intent.getAction() : null;
                        if (action == null) return;

                        if (ACTION_USB_PERMISSION.equals(action)) {
                            synchronized (this) {
                                UsbDevice device = null;
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                    try {
                                        device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice.class);
                                    } catch (Throwable t) {
                                        Log.w(TAG, "intent.getParcelableExtra(class) failed: " + t.getMessage());
                                    }
                                }
                                if (device == null) {
                                    try {
                                        device = (UsbDevice) intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                                    } catch (Throwable t) {
                                        Log.w(TAG, "legacy getParcelableExtra failed: " + t.getMessage());
                                    }
                                }
                                if (device == null) {
                                    device = pendingDevice;
                                }

                                boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                                Log.i(TAG, "[STEP 3: PERMISSION_RESULT] USB Permission callback received. Device=" 
                                    + (device != null ? device.getDeviceName() : "null") + ", granted=" + granted);

                                PluginCall savedCall = pendingPermissionCall;
                                pendingPermissionCall = null;
                                pendingDevice = null;

                                if (savedCall != null) {
                                    if (granted && device != null) {
                                        Log.i(TAG, "[STEP 3: AUTO_CONNECT] Permission granted by user. Proceeding to connect device...");
                                        JSObject statusObj = new JSObject();
                                        statusObj.put("isConnected", false);
                                        statusObj.put("state", "permission_granted");
                                        statusObj.put("message", "Izin USB diberikan. Menghubungkan kamera...");
                                        notifyListeners("onCameraStatusChanged", statusObj);

                                        completeDeviceConnection(device, savedCall);
                                    } else {
                                        Log.w(TAG, "[STEP 3: PERMISSION_DENIED] USB permission denied by user.");
                                        JSObject statusObj = new JSObject();
                                        statusObj.put("isConnected", false);
                                        statusObj.put("state", "permission_denied");
                                        statusObj.put("message", "Izin akses USB ditolak. Harap setujui dialog izin USB pada layar tablet.");
                                        notifyListeners("onCameraStatusChanged", statusObj);

                                        savedCall.reject("Izin akses USB ditolak oleh pengguna. Mohon izinkan akses USB saat dialog muncul.");
                                    }
                                }
                            }
                        } else if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                            UsbDevice device = null;
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                try {
                                    device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice.class);
                                } catch (Throwable ignored) {}
                            }
                            if (device == null) {
                                try {
                                    device = (UsbDevice) intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                                } catch (Throwable ignored) {}
                            }

                            if (device != null && isSonyCamera(device)) {
                                Log.w(TAG, "[STEP: DETACHED] Sony camera USB cable detached: " + device.getDeviceName());
                                if (ptpDriver != null) {
                                    ptpDriver.disconnect();
                                }

                                JSObject status = new JSObject();
                                status.put("isConnected", false);
                                status.put("state", "disconnected");
                                status.put("model", "None");
                                status.put("message", "Kabel USB kamera Sony terlepas.");
                                notifyListeners("onCameraStatusChanged", status);
                            }
                        } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)) {
                            UsbDevice device = null;
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                try {
                                    device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice.class);
                                } catch (Throwable ignored) {}
                            }
                            if (device == null) {
                                try {
                                    device = (UsbDevice) intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                                } catch (Throwable ignored) {}
                            }

                            if (device != null && isSonyCamera(device)) {
                                Log.i(TAG, "[STEP: ATTACHED] Sony camera USB cable attached: " + device.getDeviceName());

                                JSObject status = new JSObject();
                                status.put("isConnected", false);
                                status.put("state", "discovering");
                                status.put("model", getCameraModelName(device));
                                status.put("message", "Kamera Sony tersambung via USB OTG. Siap dihubungkan.");
                                notifyListeners("onCameraStatusChanged", status);
                            }
                        }
                    } catch (Throwable t) {
                        Log.e(TAG, "[RECEIVER_EXCEPTION] Error in USB broadcast receiver: " + t.getMessage(), t);
                    }
                }
            };

            IntentFilter filter = new IntentFilter();
            filter.addAction(ACTION_USB_PERMISSION);
            filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
            filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);

            // In Android 13+ (TIRAMISU), system callbacks from UsbManager require RECEIVER_EXPORTED
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                getContext().registerReceiver(usbReceiver, filter, Context.RECEIVER_EXPORTED);
            } else {
                getContext().registerReceiver(usbReceiver, filter);
            }
            Log.i(TAG, "[RECEIVER_INIT] BroadcastReceiver for USB permissions registered successfully.");
        } catch (Throwable t) {
            Log.e(TAG, "[RECEIVER_INIT_ERROR] Failed to register USB BroadcastReceiver: " + t.getMessage(), t);
        }
    }

    public static class DeviceAuditResult {
        public final UsbDevice device;
        public final boolean isCandidate;
        public final int score;
        public final String verdict;
        public final String details;

        public DeviceAuditResult(UsbDevice device, boolean isCandidate, int score, String verdict, String details) {
            this.device = device;
            this.isCandidate = isCandidate;
            this.score = score;
            this.verdict = verdict;
            this.details = details;
        }
    }

    private static String safeDeviceString(String s) {
        return safeDeviceString(s, "");
    }

    private static String safeDeviceString(String s, String def) {
        if (s == null || s.trim().isEmpty()) return def;
        return s.trim();
    }

    public static DeviceAuditResult auditUsbDevice(UsbDevice device) {
        if (device == null) {
            return new DeviceAuditResult(null, false, -1000, "NULL_DEVICE", "Perangkat USB bernilai null");
        }

        int vid = device.getVendorId();
        int pid = device.getProductId();
        int devClass = device.getDeviceClass();
        String mfr = "";
        String prod = "";
        try { mfr = safeDeviceString(device.getManufacturerName()); } catch (Throwable ignored) {}
        try { prod = safeDeviceString(device.getProductName()); } catch (Throwable ignored) {}
        String combined = (mfr + " " + prod).toLowerCase(Locale.US);

        // 1. HARD DISQUALIFICATIONS FOR KNOWN NON-CAMERA USB DEVICES
        if (vid == 0x0BDA) { // Realtek Semiconductor (RTL8153 USB Ethernet, Card Readers, Audio DACs)
            return new DeviceAuditResult(device, false, -1000, "REJECT_REALTEK",
                String.format(Locale.US, "Perangkat Realtek (VID: 0x%04X, PID: 0x%04X, '%s') adalah adapter Ethernet/Audio/Hub, bukan kamera Sony.", vid, pid, prod));
        }
        if (vid == 0x0B95) { // ASIX Electronics (USB Ethernet)
            return new DeviceAuditResult(device, false, -1000, "REJECT_ASIX",
                String.format(Locale.US, "Perangkat ASIX (VID: 0x%04X, PID: 0x%04X) adalah USB Ethernet, bukan kamera Sony.", vid, pid));
        }
        if (vid == 0x05E3 || vid == 0x2109 || vid == 0x1A40 || vid == 0x0424) { // USB Hubs (Genesys, VIA, Terminus, Microchip)
            return new DeviceAuditResult(device, false, -1000, "REJECT_HUB_VENDOR",
                String.format(Locale.US, "Perangkat Hub USB (VID: 0x%04X, PID: 0x%04X, '%s') bukan kamera.", vid, pid, prod));
        }
        if (devClass == UsbConstants.USB_CLASS_COMM || devClass == UsbConstants.USB_CLASS_CDC_DATA) {
            return new DeviceAuditResult(device, false, -1000, "REJECT_CDC_NETWORK",
                "Perangkat komunikasi CDC / Jaringan.");
        }
        if (devClass == UsbConstants.USB_CLASS_HUB) {
            return new DeviceAuditResult(device, false, -1000, "REJECT_USB_HUB",
                "Perangkat USB Hub.");
        }

        // 2. INSPECT INTERFACES & ENDPOINTS
        int ifCount = device.getInterfaceCount();
        boolean hasStillImageIface = false;
        boolean hasVendorSpecIface = false;
        boolean hasBulkIn = false;
        boolean hasBulkOut = false;
        boolean hasInterruptIn = false;

        for (int i = 0; i < ifCount; i++) {
            UsbInterface iface = device.getInterface(i);
            int ic = iface.getInterfaceClass();
            if (ic == UsbConstants.USB_CLASS_STILL_IMAGE) hasStillImageIface = true;
            if (ic == 0xFF) hasVendorSpecIface = true;

            for (int e = 0; e < iface.getEndpointCount(); e++) {
                UsbEndpoint ep = iface.getEndpoint(e);
                int type = ep.getType();
                int dir = ep.getDirection();
                if (type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                    if (dir == UsbConstants.USB_DIR_IN) hasBulkIn = true;
                    else if (dir == UsbConstants.USB_DIR_OUT) hasBulkOut = true;
                } else if (type == UsbConstants.USB_ENDPOINT_XFER_INT && dir == UsbConstants.USB_DIR_IN) {
                    hasInterruptIn = true;
                }
            }
        }

        if (!hasBulkIn || !hasBulkOut) {
            return new DeviceAuditResult(device, false, -500, "REJECT_NO_BULK_PIPES",
                String.format(Locale.US, "Perangkat (VID: 0x%04X, PID: 0x%04X) tidak memiliki pasangan Bulk IN/OUT.", vid, pid));
        }

        // 3. POSITIVE IDENTIFICATION & SCORING
        int score = 0;
        boolean isSony = (vid == SONY_VENDOR_ID);
        boolean mentionsSony = combined.contains("sony") || combined.contains("ilce") || combined.contains("alpha") || combined.contains("dsc");

        if (isSony) {
            score = 10000;
            if (combined.contains("ilce") || combined.contains("alpha") || combined.contains("6400") || combined.contains("a6") || combined.contains("a7") || combined.contains("zv")) {
                score += 2500;
            }
            if (hasStillImageIface) score += 1000;
            if (hasVendorSpecIface) score += 1000; // Sony PC Remote interface (0xFF)
            if (hasInterruptIn) score += 500;
            return new DeviceAuditResult(device, true, score, "ACCEPT_SONY_CAMERA",
                String.format(Locale.US, "Kamera Sony terkonfirmasi (VID: 0x054C, PID: 0x%04X, '%s')", pid, prod.isEmpty() ? "ILCE/Alpha" : prod));
        }

        if (mentionsSony) {
            score = 8000;
            if (hasStillImageIface) score += 1000;
            if (hasVendorSpecIface) score += 500;
            if (hasInterruptIn) score += 500;
            return new DeviceAuditResult(device, true, score, "ACCEPT_SONY_BY_DESCRIPTOR",
                String.format(Locale.US, "Kamera Sony terdeteksi via deskriptor (VID: 0x%04X, PID: 0x%04X, '%s')", vid, pid, prod));
        }

        if (hasStillImageIface) {
            // Standard PTP Still Image device (e.g. Canon 0x04A9, Nikon 0x04B0, etc.)
            score = 5000;
            if (hasInterruptIn) score += 500;
            return new DeviceAuditResult(device, true, score, "ACCEPT_GENERIC_PTP",
                String.format(Locale.US, "Perangkat PTP Still Image standar (VID: 0x%04X, PID: 0x%04X, '%s')", vid, pid, prod));
        }

        // Non-Sony, non-StillImage device with Vendor-Specific 0xFF bulk endpoints
        return new DeviceAuditResult(device, false, -200, "REJECT_NON_SONY_VENDOR_SPEC",
            String.format(Locale.US, "Perangkat non-Sony dengan interface Vendor-Specific (VID: 0x%04X, PID: 0x%04X, '%s') bukan kamera PTP.", vid, pid, prod));
    }

    public static boolean isSonyCamera(UsbDevice device) {
        return auditUsbDevice(device).isCandidate;
    }

    private String getCameraModelName(UsbDevice device) {
        if (device == null) return "Sony Camera";
        try {
            String product = device.getProductName();
            if (product != null && !product.trim().isEmpty()) {
                return product.trim();
            }
        } catch (Throwable ignored) {}

        if (device.getVendorId() == SONY_VENDOR_ID) {
            return "Sony Alpha Camera (0x" + Integer.toHexString(device.getProductId()) + ")";
        }
        return "Sony Camera (USB)";
    }

    @PluginMethod
    public void discoverCameras(PluginCall call) {
        try {
            Log.i(TAG, "[STEP 1: DISCOVER] discoverCameras invoked from UI.");
            JSArray cameras = new JSArray();
            if (usbManager == null) {
                usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
            }

            HashMap<String, UsbDevice> deviceList = usbManager != null ? usbManager.getDeviceList() : new HashMap<>();
            Log.i(TAG, "[STEP 1: DISCOVER] Total USB devices attached: " + deviceList.size());

            List<DeviceAuditResult> candidates = new ArrayList<>();

            for (Map.Entry<String, UsbDevice> entry : deviceList.entrySet()) {
                UsbDevice device = entry.getValue();
                DeviceAuditResult audit = auditUsbDevice(device);
                Log.i(TAG, String.format(Locale.US,
                    "[USB_DEVICE_AUDIT] %s | VID=0x%04X, PID=0x%04X, Mfr=\"%s\", Prod=\"%s\", DevClass=0x%02X, Ifaces=%d -> %s (Score=%d, %s)",
                    entry.getKey(), device.getVendorId(), device.getProductId(),
                    safeDeviceString(device.getManufacturerName()), safeDeviceString(device.getProductName()),
                    device.getDeviceClass(), device.getInterfaceCount(),
                    audit.isCandidate ? "CANDIDATE_ACCEPTED" : "REJECTED",
                    audit.score, audit.details));

                if (audit.isCandidate) {
                    candidates.add(audit);
                }
            }

            // Sort candidates by score descending: Sony A6400 / ILCE will ALWAYS be first!
            Collections.sort(candidates, (a, b) -> Integer.compare(b.score, a.score));

            for (DeviceAuditResult c : candidates) {
                UsbDevice device = c.device;
                JSObject cam = new JSObject();
                cam.put("id", device.getDeviceName());
                cam.put("name", getCameraModelName(device));
                cam.put("manufacturer", safeDeviceString(device.getManufacturerName(), "Sony Corporation"));
                cam.put("model", getCameraModelName(device));
                cam.put("connectionType", "usb");
                cam.put("hasPermission", usbManager != null && usbManager.hasPermission(device));
                cam.put("vendorId", device.getVendorId());
                cam.put("productId", device.getProductId());
                cam.put("score", c.score);
                cameras.put(cam);
            }

            JSObject ret = new JSObject();
            ret.put("cameras", cameras);
            Log.i(TAG, "[STEP 1: DISCOVER_RESULT] Discovered " + cameras.length() + " valid camera(s) (Filtered from " + deviceList.size() + " attached USB devices).");
            call.resolve(ret);
        } catch (Throwable t) {
            Log.e(TAG, "[STEP 1: DISCOVER_ERROR] Failed to discover USB devices: " + t.getMessage(), t);
            call.reject("Gagal memindai perangkat USB: " + t.getMessage());
        }
    }

    @PluginMethod
    public void connectCamera(PluginCall call) {
        try {
            Log.i(TAG, "[STEP 2: CONNECT_START] connectCamera invoked from UI.");
            String cameraId = call.getString("cameraId");
            UsbDevice targetDevice = null;

            if (usbManager == null) {
                usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
            }

            HashMap<String, UsbDevice> deviceList = usbManager != null ? usbManager.getDeviceList() : new HashMap<>();

            // 1. If cameraId provided, verify it is actually an accepted camera
            if (cameraId != null && !cameraId.isEmpty()) {
                UsbDevice dev = deviceList.get(cameraId);
                if (dev != null) {
                    DeviceAuditResult audit = auditUsbDevice(dev);
                    if (audit.isCandidate) {
                        targetDevice = dev;
                        Log.i(TAG, "[STEP 2: TARGET_VERIFIED] Selected device by cameraId: " + dev.getDeviceName() + " (Score=" + audit.score + ")");
                    } else {
                        Log.w(TAG, "[STEP 2: TARGET_REJECTED] Device requested by cameraId (" + cameraId + ") is not a valid camera: " + audit.details + ". Searching for valid Sony camera...");
                    }
                }
            }

            // 2. If targetDevice still null, pick highest scoring candidate from all attached devices
            if (targetDevice == null) {
                List<DeviceAuditResult> candidates = new ArrayList<>();
                for (UsbDevice dev : deviceList.values()) {
                    DeviceAuditResult audit = auditUsbDevice(dev);
                    if (audit.isCandidate) {
                        candidates.add(audit);
                    }
                }
                if (!candidates.isEmpty()) {
                    Collections.sort(candidates, (a, b) -> Integer.compare(b.score, a.score));
                    targetDevice = candidates.get(0).device;
                    Log.i(TAG, "[STEP 2: BEST_CANDIDATE] Selected highest scoring camera: " + targetDevice.getDeviceName() + " (Score=" + candidates.get(0).score + ", " + candidates.get(0).details + ")");
                }
            }

            if (targetDevice == null) {
                StringBuilder attachedDesc = new StringBuilder();
                for (UsbDevice d : deviceList.values()) {
                    if (attachedDesc.length() > 0) attachedDesc.append(", ");
                    attachedDesc.append(String.format(Locale.US, "%s (VID: 0x%04X, PID: 0x%04X)",
                        safeDeviceString(d.getProductName(), d.getDeviceName()), d.getVendorId(), d.getProductId()));
                }
                String noCamMsg = "Kamera Sony tidak terdeteksi via USB OTG. Perangkat USB terdeteksi: [" 
                    + (attachedDesc.length() > 0 ? attachedDesc.toString() : "Tidak ada") 
                    + "]. Pastikan kabel data Sony ILCE-6400 terhubung ke tablet dan mode USB disetel ke 'PC Remote'.";
                Log.w(TAG, "[STEP 2: NO_DEVICE] " + noCamMsg);
                call.reject(noCamMsg);
                return;
            }

            Log.i(TAG, "[STEP 2: DEVICE_FOUND] Target camera selected: " + targetDevice.getDeviceName() 
                + " (VID=0x" + Integer.toHexString(targetDevice.getVendorId()) + ", PID=0x" + Integer.toHexString(targetDevice.getProductId()) + ")");

            // Check if permission already granted
            if (!usbManager.hasPermission(targetDevice)) {
                Log.i(TAG, "[STEP 3: REQUEST_PERMISSION] Permission not yet granted. Requesting USB permission from system...");

                // Keep call alive so Capacitor preserves the promise across the asynchronous permission flow
                call.setKeepAlive(true);
                pendingPermissionCall = call;
                pendingDevice = targetDevice;

                // Notify UI that permission dialog is being presented
                JSObject statusObj = new JSObject();
                statusObj.put("isConnected", false);
                statusObj.put("state", "requesting_permission");
                statusObj.put("message", "Meminta izin USB. Silakan pilih 'Selalu Izinkan / OK' pada dialog di layar.");
                notifyListeners("onCameraStatusChanged", statusObj);

                // Build explicit intent for Android 14+ (Targeting SDK 34)
                Intent intent = new Intent(ACTION_USB_PERMISSION);
                intent.setPackage(getContext().getPackageName());

                int flags = 0;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    flags |= PendingIntent.FLAG_MUTABLE;
                }

                PendingIntent permissionIntent = PendingIntent.getBroadcast(
                    getContext(),
                    0,
                    intent,
                    flags
                );

                usbManager.requestPermission(targetDevice, permissionIntent);
                Log.i(TAG, "[STEP 3: DIALOG_PROMPTED] USB permission dialog dispatched to screen.");
                return;
            }

            Log.i(TAG, "[STEP 3: HAS_PERMISSION] Permission already granted. Proceeding directly to connection.");
            completeDeviceConnection(targetDevice, call);
        } catch (Throwable t) {
            Log.e(TAG, "[STEP 2: CRASH_PREVENTED] Critical exception in connectCamera: " + t.getMessage(), t);
            call.reject("Terjadi kesalahan saat memproses koneksi USB: " + t.getMessage());
        }
    }

    private void completeDeviceConnection(UsbDevice device, PluginCall call) {
        executor.execute(() -> {
            UsbDeviceConnection conn = null;
            try {
                Log.i(TAG, "[STEP 4: OPEN_DEVICE] Opening UsbDeviceConnection for " + device.getDeviceName() + "...");
                conn = usbManager.openDevice(device);
                if (conn == null) {
                    Log.e(TAG, "[STEP 4: OPEN_FAILED] usbManager.openDevice returned null.");
                    call.reject("Gagal membuka koneksi USB perangkat. Pastikan izin USB telah diberikan dan kabel terpasang dengan baik.");
                    return;
                }
                Log.i(TAG, "[STEP 4: OPEN_SUCCESS] USB Device Connection opened successfully. FileDescriptor=" + conn.getFileDescriptor());

                JSObject statusConnecting = new JSObject();
                statusConnecting.put("isConnected", false);
                statusConnecting.put("state", "initializing_protocol");
                statusConnecting.put("message", "Menginisialisasi protokol PTP Sony...");
                notifyListeners("onCameraStatusChanged", statusConnecting);

                boolean connected = ptpDriver.connect(device, conn, new SonyPtpDriver.CameraEventListener() {
                    @Override
                    public void onPhotoCaptured(SonyPtpDriver.CapturedPhotoResult photo) {
                        try {
                            Log.i(TAG, "[EVENT: ON_PHOTO_CAPTURED] Photo received from camera: " + photo.photoId);
                            JSObject obj = new JSObject();
                            obj.put("photoId", photo.photoId);
                            obj.put("nativeFilePath", photo.nativeFilePath);
                            obj.put("dataUrl", photo.dataUrl);
                            obj.put("width", photo.width);
                            obj.put("height", photo.height);
                            obj.put("format", photo.format);
                            obj.put("correlationId", photo.correlationId);
                            obj.put("triggerSource", photo.triggerSource);
                            obj.put("totalMs", photo.totalMs);
                            obj.put("tButtonToResponseMs", photo.tButtonToResponseMs);
                            obj.put("tResponseToTransferStartMs", photo.tResponseToTransferStartMs);
                            obj.put("tTransferDurationMs", photo.tTransferDurationMs);
                            obj.put("tFileToUiMs", photo.tFileToUiMs);
                            notifyListeners("onPhotoCaptured", obj);
                        } catch (Throwable t) {
                            Log.e(TAG, "Error notifying onPhotoCaptured: " + t.getMessage());
                        }
                    }

                    @Override
                    public void onCameraDisconnected() {
                        try {
                            Log.w(TAG, "[EVENT: ON_DISCONNECTED] Camera disconnected callback received.");
                            JSObject status = new JSObject();
                            status.put("isConnected", false);
                            status.put("state", SonyPtpDriver.STATE_DISCONNECTED);
                            status.put("model", "None");
                            status.put("message", "Koneksi kabel USB kamera Sony terputus.");
                            notifyListeners("onCameraStatusChanged", status);
                        } catch (Throwable t) {
                            Log.e(TAG, "Error notifying onCameraDisconnected: " + t.getMessage());
                        }
                    }

                    @Override
                    public void onCameraError(String errorMessage) {
                        try {
                            Log.e(TAG, "[EVENT: ON_ERROR] Camera error callback: " + errorMessage);
                            JSObject status = new JSObject();
                            status.put("isConnected", ptpDriver != null && ptpDriver.isConnected());
                            status.put("state", SonyPtpDriver.STATE_ERROR);
                            status.put("error", errorMessage);
                            status.put("message", errorMessage);
                            notifyListeners("onCameraStatusChanged", status);
                        } catch (Throwable t) {
                            Log.e(TAG, "Error notifying onCameraError: " + t.getMessage());
                        }
                    }

                    @Override
                    public void onStateChanged(String state, String message) {
                        try {
                            SonyPtpDriver.CameraInfo info = ptpDriver.getCameraInfo();
                            JSObject status = new JSObject();
                            status.put("isConnected", info.isConnected);
                            status.put("state", state);
                            status.put("model", info.model);
                            status.put("manufacturer", info.manufacturer);
                            status.put("message", message);
                            status.put("batteryLevel", info.batteryLevel);
                            status.put("isLiveViewStreaming", info.isLiveViewStreaming);
                            status.put("liveViewError", info.liveViewError);
                            status.put("fps", info.fps);
                            status.put("totalFrames", info.totalFrames);
                            status.put("firstValidFrameTimeMs", ptpDriver.getFirstValidFrameTimeMs());
                            notifyListeners("onCameraStatusChanged", status);
                        } catch (Throwable t) {
                            Log.e(TAG, "Error notifying onStateChanged: " + t.getMessage());
                        }
                    }

                    @Override
                    public void onBatteryChanged(int percent) {
                        try {
                            SonyPtpDriver.CameraInfo info = ptpDriver.getCameraInfo();
                            JSObject status = new JSObject();
                            status.put("isConnected", info.isConnected);
                            status.put("state", info.state);
                            status.put("model", info.model);
                            status.put("batteryLevel", percent);
                            status.put("message", "Baterai kamera Sony: " + percent + "%");
                            notifyListeners("onCameraStatusChanged", status);
                        } catch (Throwable t) {
                            Log.e(TAG, "Error notifying onBatteryChanged: " + t.getMessage());
                        }
                    }
                });

                if (connected) {
                    SonyPtpDriver.CameraInfo info = ptpDriver.getCameraInfo();
                    Log.i(TAG, "[STEP 8: READY] Sony camera connection established: " + info.model);

                    JSObject status = new JSObject();
                    status.put("isConnected", true);
                    status.put("state", info.state);
                    status.put("model", info.model);
                    status.put("manufacturer", info.manufacturer);
                    status.put("serialNumber", info.serialNumber);
                    status.put("batteryLevel", info.batteryLevel);
                    status.put("message", "Kamera Sony siap digunakan.");

                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("status", status);

                    notifyListeners("onCameraStatusChanged", status);
                    call.resolve(ret);
                } else {
                    Log.e(TAG, "[STEP 8: FAILED] Sony PTP protocol handshake failed.");
                    String err = ptpDriver.getLastErrorMessage();
                    if (err == null || err.isEmpty()) {
                        err = "Gagal menginisialisasi protokol PTP Sony pada kamera (" + getCameraModelName(device) + "). Pastikan kamera disetel ke mode 'PC Remote'.";
                    }
                    JSObject statusObj = new JSObject();
                    statusObj.put("isConnected", false);
                    statusObj.put("state", SonyPtpDriver.STATE_ERROR);
                    statusObj.put("error", err);
                    statusObj.put("message", err);
                    statusObj.put("diagnosticReport", ptpDriver.getLastDiagnosticReport());
                    statusObj.put("lastSuccessfulStage", ptpDriver.getLastSuccessfulStage());
                    statusObj.put("failedStage", ptpDriver.getFailedStage());
                    statusObj.put("lastEndpoint", ptpDriver.getLastBulkEndpoint());
                    statusObj.put("lastOpCode", ptpDriver.getLastOpCode());
                    statusObj.put("lastReturnCode", ptpDriver.getLastReturnCode());
                    statusObj.put("lastHaltRecoveryStatus", ptpDriver.getLastHaltRecoveryStatus());
                    notifyListeners("onCameraStatusChanged", statusObj);
                    call.reject(err);
                }
            } catch (Throwable t) {
                Log.e(TAG, "[CONNECT_EXCEPTION] Exception in completeDeviceConnection: " + t.getMessage(), t);
                if (conn != null) {
                    try { conn.close(); } catch (Throwable ignored) {}
                }
                call.reject("Error saat menghubungkan kamera: " + t.getMessage());
            }
        });
    }

    @PluginMethod
    public void disconnectCamera(PluginCall call) {
        executor.execute(() -> {
            try {
                Log.i(TAG, "[STEP: DISCONNECT] Disconnecting camera via plugin call...");
                if (ptpDriver != null) {
                    ptpDriver.disconnect();
                }

                JSObject status = new JSObject();
                status.put("isConnected", false);
                status.put("state", "disconnected");
                status.put("model", "None");
                status.put("message", "Kamera telah diputuskan.");
                notifyListeners("onCameraStatusChanged", status);

                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Throwable t) {
                Log.e(TAG, "Error during disconnectCamera: " + t.getMessage(), t);
                call.reject("Error saat memutuskan kamera: " + t.getMessage());
            }
        });
    }

    @PluginMethod
    public void reconnectCamera(PluginCall call) {
        executor.execute(() -> {
            try {
                Log.i(TAG, "[STEP: RECONNECT] reconnectCamera called. Cleaning up previous handles safely...");
                if (ptpDriver != null) {
                    ptpDriver.disconnect();
                }
                try {
                    Thread.sleep(200);
                } catch (InterruptedException ignored) {}

                // Delegate directly to connectCamera
                connectCamera(call);
            } catch (Throwable t) {
                Log.e(TAG, "Error in reconnectCamera: " + t.getMessage(), t);
                call.reject("Gagal menghubungkan ulang kamera: " + t.getMessage());
            }
        });
    }

    @PluginMethod
    public void getCameraStatus(PluginCall call) {
        try {
            SonyPtpDriver.CameraInfo info = ptpDriver != null ? ptpDriver.getCameraInfo() : null;
            JSObject status = new JSObject();
            if (info != null) {
                status.put("buildIdentifier", SonyPtpDriver.BUILD_IDENTIFIER);
                status.put("isConnected", info.isConnected);
                status.put("state", info.state);
                status.put("model", info.model);
                status.put("manufacturer", info.manufacturer);
                status.put("serialNumber", info.serialNumber);
                status.put("batteryLevel", info.batteryLevel);
                status.put("isLiveViewStreaming", info.isLiveViewStreaming);
                status.put("liveViewError", info.liveViewError);
                status.put("fps", info.fps);
                status.put("totalFrames", info.totalFrames);
                status.put("firstValidFrameTimeMs", ptpDriver.getFirstValidFrameTimeMs());
                status.put("diagnosticReport", ptpDriver.getLastDiagnosticReport());
                status.put("lastSuccessfulStage", ptpDriver.getLastSuccessfulStage());
                status.put("failedStage", ptpDriver.getFailedStage());
                status.put("lastEndpoint", ptpDriver.getLastBulkEndpoint());
                status.put("lastOpCode", ptpDriver.getLastOpCode());
                status.put("lastReturnCode", ptpDriver.getLastReturnCode());
                status.put("lastHaltRecoveryStatus", ptpDriver.getLastHaltRecoveryStatus());
                status.put("message", info.isConnected ? ("Kamera " + info.model + " siap digunakan.") : "Kamera terputus.");
            } else {
                status.put("isConnected", false);
                status.put("state", SonyPtpDriver.STATE_DISCONNECTED);
                status.put("model", "None");
                status.put("diagnosticReport", "SonyPtpDriver not initialized");
                status.put("message", "Kamera belum terhubung.");
            }
            call.resolve(status);
        } catch (Throwable t) {
            Log.e(TAG, "Error in getCameraStatus: " + t.getMessage(), t);
            call.reject("Gagal mendapatkan status kamera: " + t.getMessage());
        }
    }

    @PluginMethod
    public void getUsbDiagnostics(PluginCall call) {
        try {
            JSObject ret = new JSObject();
            ret.put("diagnosticReport", ptpDriver != null ? ptpDriver.getLastDiagnosticReport() : "Driver not initialized");
            ret.put("lastError", ptpDriver != null ? ptpDriver.getLastErrorMessage() : "");
            ret.put("currentState", ptpDriver != null ? ptpDriver.getCurrentState() : "DISCONNECTED");
            ret.put("lastSuccessfulStage", ptpDriver != null ? ptpDriver.getLastSuccessfulStage() : "NONE");
            ret.put("failedStage", ptpDriver != null ? ptpDriver.getFailedStage() : "NONE");
            ret.put("lastEndpoint", ptpDriver != null ? ptpDriver.getLastBulkEndpoint() : "");
            ret.put("lastOpCode", ptpDriver != null ? ptpDriver.getLastOpCode() : "");
            ret.put("lastReturnCode", ptpDriver != null ? ptpDriver.getLastReturnCode() : 0);
            ret.put("lastHaltRecoveryStatus", ptpDriver != null ? ptpDriver.getLastHaltRecoveryStatus() : "NONE");
            ret.put("buildIdentifier", SonyPtpDriver.BUILD_IDENTIFIER);
            ret.put("versionCode", 6);
            ret.put("versionName", "1.0.5-p0-parity-05");
            call.resolve(ret);
        } catch (Throwable t) {
            call.reject("Failed to get USB diagnostics: " + t.getMessage());
        }
    }

    @PluginMethod
    public void getCameraCapabilities(PluginCall call) {
        try {
            JSObject caps = new JSObject();
            caps.put("supportsLiveView", true);
            caps.put("supportsCapture", true);
            caps.put("supportsApertureControl", false);
            caps.put("supportsShutterSpeedControl", false);
            caps.put("supportsIsoControl", false);
            caps.put("supportedIsoValues", new JSArray());
            caps.put("supportedApertures", new JSArray());
            caps.put("supportedShutterSpeeds", new JSArray());
            call.resolve(caps);
        } catch (Throwable t) {
            call.reject("Gagal mendapatkan kapabilitas kamera: " + t.getMessage());
        }
    }

    @PluginMethod
    public void startLiveView(PluginCall call) {
        executor.execute(() -> {
            try {
                Log.i(TAG, "[STEP 9: LIVEVIEW_START] startLiveView requested.");
                int port = 4949;
                boolean started = ptpDriver != null && ptpDriver.startLiveView(port);
                if (started) {
                    JSObject ret = new JSObject();
                    ret.put("streamUrl", "http://127.0.0.1:" + port + "/liveview");
                    ret.put("width", 1024);
                    ret.put("height", 680);
                    ret.put("fps", 25);
                    Log.i(TAG, "[STEP 9: LIVEVIEW_SUCCESS] Live view stream ready at http://127.0.0.1:" + port + "/liveview");
                    call.resolve(ret);
                } else {
                    String err = ptpDriver != null ? ptpDriver.getLiveViewErrorMessage() : null;
                    if (err == null || err.isEmpty()) {
                        err = ptpDriver != null ? ptpDriver.getLastErrorMessage() : null;
                    }
                    if (err == null || err.isEmpty()) {
                        err = "Live view gagal diinisialisasi pada kamera Sony. Pastikan kamera menyala, baterai mencukupi, dan mode USB diatur ke 'PC Remote'.";
                    }
                    Log.e(TAG, "[STEP 9: LIVEVIEW_FAILED] " + err);
                    call.reject(err);
                }
            } catch (Throwable t) {
                Log.e(TAG, "[STEP 9: LIVEVIEW_EXCEPTION] " + t.getMessage(), t);
                call.reject("Error saat memulai live view: " + t.getMessage());
            }
        });
    }

    @PluginMethod
    public void stopLiveView(PluginCall call) {
        executor.execute(() -> {
            try {
                if (ptpDriver != null) {
                    ptpDriver.stopLiveView();
                }
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject("Error saat menghentikan live view: " + t.getMessage());
            }
        });
    }

    @PluginMethod
    public void capturePhoto(PluginCall call) {
        String callCorrId = call.getString("correlationId");
        if (callCorrId == null || callCorrId.trim().isEmpty()) {
            callCorrId = "CORR_" + System.currentTimeMillis() + "_" + Integer.toHexString((int)(Math.random() * 0xFFFF));
        }
        final String correlationId = callCorrId;

        executor.execute(() -> {
            try {
                Log.i(TAG, "[" + correlationId + "] [STEP 10: CAPTURE_START] capturePhoto requested via plugin method.");
                if (ptpDriver == null) {
                    throw new IllegalStateException("Driver kamera belum diinisialisasi.");
                }

                SonyPtpDriver.CapturedPhotoResult photo = ptpDriver.capturePhoto(correlationId);
                JSObject ret = new JSObject();
                ret.put("photoId", photo.photoId);
                ret.put("nativeFilePath", photo.nativeFilePath);
                ret.put("dataUrl", photo.dataUrl);
                ret.put("width", photo.width);
                ret.put("height", photo.height);
                ret.put("format", photo.format);
                ret.put("correlationId", correlationId);
                ret.put("triggerSource", photo.triggerSource);
                ret.put("totalMs", photo.totalMs);
                ret.put("tButtonToResponseMs", photo.tButtonToResponseMs);
                ret.put("tResponseToTransferStartMs", photo.tResponseToTransferStartMs);
                ret.put("tTransferDurationMs", photo.tTransferDurationMs);
                ret.put("tFileToUiMs", photo.tFileToUiMs);
                Log.i(TAG, "[" + correlationId + "] [STEP 10: CAPTURE_SUCCESS] Captured photo retrieved successfully: " 
                    + photo.photoId + " (File: " + photo.nativeFilePath + ", " + photo.width + "x" + photo.height + ", Total=" + photo.totalMs + "ms)");
                call.resolve(ret);
            } catch (Throwable t) {
                String errMsg = t.getMessage() != null ? t.getMessage() : t.toString();
                Log.e(TAG, "[" + correlationId + "] [STEP 10: CAPTURE_FAILED] Gagal mengambil foto: " + errMsg, t);
                call.reject(errMsg);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        boolean isChangingConfig = getActivity() != null && getActivity().isChangingConfigurations();
        if (isChangingConfig) {
            Log.i(TAG, "[LIFECYCLE_ROTATION] Activity changing configurations (screen rotation). Preserving active USB connection and PTP session.");
            return;
        }
        Log.i(TAG, "[LIFECYCLE_CLEANUP] Activity is terminating completely. Releasing USB resources.");
        try {
            executor.shutdownNow();
        } catch (Throwable ignored) {}
        if (usbReceiver != null) {
            try {
                getContext().unregisterReceiver(usbReceiver);
            } catch (Throwable ignored) {}
        }
        if (ptpDriver != null) {
            ptpDriver.disconnect();
        }
    }
}
