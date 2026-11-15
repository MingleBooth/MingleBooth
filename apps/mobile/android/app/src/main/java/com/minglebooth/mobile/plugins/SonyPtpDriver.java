package com.minglebooth.mobile.plugins;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.hardware.usb.UsbConfiguration;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.os.Environment;
import android.util.Base64;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.CRC32;

/**
 * SonyPtpDriver - High-Performance Retained Android USB PTP Driver for Sony Alpha Cameras.
 * 
 * Supports:
 * - Direct USB OTG connection on Android (ARM64 / x86_64)
 * - Sony A6400 (ILCE-6400) and Sony A7C II (ILCE-7CM2) in PC Remote mode
 * - Full multi-phase Sony SDIO handshake (0x9201, 0x9202, 0x1004, 0x9209)
 * - 64 KB chunk-aligned USB bulk streaming preventing packet loss and endpoint desynchronization
 * - Virtual Live View object extraction (0xFFFFC002) with strict SOI (FF D8) and EOI (FF D9) validation
 * - Local loopback MJPEG HTTP streaming on port 4949 with standard MIME boundaries
 * - Full Shutter Capture (0x100E) and background physical shutter detection (0x4002 ObjectAdded)
 * - Retained Singleton across Activity/WebView orientation and configuration changes
 */
public class SonyPtpDriver {
    private static final String TAG = "SonyPtpDriver";

    // PTP Container Types
    public static final int PTP_TYPE_UNDEFINED = 0;
    public static final int PTP_TYPE_COMMAND = 1;
    public static final int PTP_TYPE_DATA = 2;
    public static final int PTP_TYPE_RESPONSE = 3;
    public static final int PTP_TYPE_EVENT = 4;

    // Standard PTP Operation Codes
    public static final int PTP_OC_GetDeviceInfo = 0x1001;
    public static final int PTP_OC_OpenSession = 0x1002;
    public static final int PTP_OC_CloseSession = 0x1003;
    public static final int PTP_OC_GetStorageIDs = 0x1004;
    public static final int PTP_OC_GetStorageInfo = 0x1005;
    public static final int PTP_OC_GetObjectHandles = 0x1007;
    public static final int PTP_OC_GetObjectInfo = 0x1008;
    public static final int PTP_OC_GetObject = 0x1009;
    public static final int PTP_OC_InitiateCapture = 0x100E;
    public static final int PTP_OC_GetDevicePropDesc = 0x1014;
    public static final int PTP_OC_GetDevicePropValue = 0x1015;
    public static final int PTP_OC_SetDevicePropValue = 0x1016;

    // Standard PTP Response Codes
    public static final int PTP_RC_OK = 0x2001;
    public static final int PTP_RC_GeneralError = 0x2002;
    public static final int PTP_RC_SessionNotOpen = 0x2003;
    public static final int PTP_RC_InvalidTransactionID = 0x2004;
    public static final int PTP_RC_InvalidObjectHandle = 0x2006;
    public static final int PTP_RC_DeviceBusy = 0x2019;
    public static final int PTP_RC_SessionAlreadyOpen = 0x201E;

    // Standard PTP Event Codes
    public static final int PTP_EC_ObjectAdded = 0x4002;
    public static final int PTP_EC_DevicePropChanged = 0x4006;

    // Sony Vendor Event Codes (Interrupt Endpoint 0x83)
    public static final int PTP_EC_Sony_ObjectAdded = 0xC201;
    public static final int PTP_EC_Sony_ObjectRemoved = 0xC202;
    public static final int PTP_EC_Sony_PropertyChanged = 0xC203;

    // Sony Specific OpCodes & Properties
    public static final int PTP_OC_SONY_SDIOConnect = 0x9201;
    public static final int PTP_OC_SONY_SDIOGetExtDeviceInfo = 0x9202;
    public static final int PTP_OC_SONY_GetSDIOGetExtDeviceInfo = PTP_OC_SONY_SDIOGetExtDeviceInfo;
    public static final int PTP_OC_SONY_SetControlDeviceB = 0x9207;
    public static final int PTP_OC_SONY_GetAllExtDeviceInfo = 0x9209;

    public static final int SONY_BATTERY_LEVEL = 0xD218;
    public static final int SONY_SHUTTER_SPEED = 0xD20D;
    public static final int SONY_FNUMBER = 0x5007;
    public static final int SONY_ISO = 0xD21E;
    public static final int SONY_LIVE_VIEW_STATUS = 0xD221;
    public static final int SONY_MOVIE_RECORDING = 0xD21D;
    public static final int SONY_LIVEVIEW_OBJECT_HANDLE = 0xFFFFC002;

    // Sony PTP Device Control Properties (used with 0x9207 SetControlDeviceB)
    public static final int SONY_DPC_S1_BUTTON = 0xD2C1; // Shutter Half-press (AF/AE lock)
    public static final int SONY_DPC_S2_BUTTON = 0xD2C2; // Shutter Full-press (Shutter Trip / Capture)
    public static final int SONY_DPC_S1_AND_S2_BUTTON = 0xD2E6; // Both S1 and S2 (Instant Shutter Release)
    public static final int SONY_DPC_REQUEST_ONE_SHOOTING = 0xD2C7; // Direct Still Image Capture Request
    public static final int SONY_DPC_SHOOTING_FILE_INFO = 0xD215; // Image ready status flag (bit 15)
    public static final int SONY_DPC_STILL_IMAGE_STORE_DESTINATION = 0xD222; // 1=MemoryCard, 2=HostPC, 3=HostPCAndMemoryCard
    public static final int SONY_DPC_STILL_IMAGE_TRANS_SIZE = 0xD223; // 0=Original, 1=Small
    public static final int SONY_DPC_PRIORITY_KEY = 0xD229; // 1=Camera, 2=PCRemote
    public static final int SONY_DPC_FOCUS_INDICATION = 0xD213; // Focus status (0x01=tracking, 0x02=AF-S locked, 0x03=AF-C locked)

    // Sony Button Control States (2-byte uint16 payload for SetControlDeviceB)
    public static final int SONY_BUTTON_PRESS = 0x0002;
    public static final int SONY_BUTTON_RELEASE = 0x0001;

    // Sony Special In-Memory Pseudo-Object Handle (PC Remote Buffer)
    public static final int SONY_SHOT_OBJECT_HANDLE = 0xFFFFC001;

    public static boolean isValidObjectHandle(int handle) {
        long u = handle & 0xFFFFFFFFL;
        return u != 0L && u != 0xFFFFFFFFL;
    }

    // Connection States (Mandatory Task C Separation)
    public static final String STATE_DISCONNECTED = "DISCONNECTED";
    public static final String STATE_USB_CONNECTED = "USB_CONNECTED";
    public static final String STATE_USB_DEVICE_DETECTED = "USB_DEVICE_DETECTED";
    public static final String STATE_USB_PERMISSION_GRANTED = "USB_PERMISSION_GRANTED";
    public static final String STATE_USB_INTERFACE_CLAIMED = "USB_INTERFACE_CLAIMED";
    public static final String STATE_PTP_SESSION_OPEN = "PTP_SESSION_OPEN";
    public static final String STATE_CAMERA_READY = "CAMERA_READY";
    public static final String STATE_LIVE_VIEW_STARTING = "LIVE_VIEW_STARTING";
    public static final String STATE_LIVE_VIEW_STREAMING = "LIVE_VIEW_STREAMING";
    public static final String STATE_LIVE_VIEW_ERROR = "LIVE_VIEW_ERROR";
    public static final String STATE_CAPTURE_IN_PROGRESS = "CAPTURE_IN_PROGRESS";
    public static final String STATE_ERROR = "ERROR";

    // USB Transfer Buffer Parameters
    private static final int USB_TRANSFER_TIMEOUT_MS = 15000;
    private static final int STREAM_READ_TIMEOUT_MS = 3000;
    private static final int USB_READ_RETRIES = 3;
    // 16 KB: Capped strictly to Linux kernel drivers/usb/core/devio.c MAX_USBFS_BUFFER_SIZE (16384 bytes).
    // Buffer sizes exceeding 16KB are rejected by the kernel with -EINVAL, returning -1 in Android bulkTransfer.
    public static final int USB_READ_CHUNK = 16 * 1024;
    public static final int USB_HEADER_READ_SIZE = 512; // 512 bytes: Single USB 2.0 Bulk High-Speed Packet

    // Retained Singleton Instance
    private static volatile SonyPtpDriver instance;

    public static SonyPtpDriver getInstance(Context context) {
        if (instance == null) {
            synchronized (SonyPtpDriver.class) {
                if (instance == null) {
                    instance = new SonyPtpDriver(context.getApplicationContext());
                }
            }
        }
        return instance;
    }

    // Hardware and Context
    private final Context context;
    private UsbDevice usbDevice;
    private UsbDeviceConnection connection;
    private UsbInterface usbInterface;
    private UsbEndpoint bulkIn;
    private UsbEndpoint bulkOut;
    private UsbEndpoint interruptIn;

    // State Tracking
    private int transactionId = 0;
    private volatile boolean isConnected = false;
    private volatile boolean isTransportOpen = false;
    private volatile boolean isSessionOpen = false;
    private volatile String currentState = STATE_DISCONNECTED;
    private volatile String cameraModel = "Sony Camera";
    private volatile String manufacturer = "Sony Corporation";
    private volatile String serialNumber = "";
    private volatile String lastErrorMessage = "";
    private volatile String lastDiagnosticReport = "No USB diagnostics collected yet.";
    private volatile String liveViewErrorMessage = "";
    private volatile int lastBatteryPercent = -1;
    private volatile String lastExposureLabel = null;
    private volatile boolean isCapturing = false;
    private volatile boolean isSoftwareCapturing = false;
    private final java.util.concurrent.atomic.AtomicReference<Integer> pendingCapturedHandle = new java.util.concurrent.atomic.AtomicReference<>(null);
    private volatile java.util.concurrent.CountDownLatch photoReadyLatch = null;

    // Diagnostic & Stage Tracking (TUGAS 1 & TUGAS 3)
    private volatile String lastSuccessfulStage = "NONE";
    private volatile String failedStage = "NONE";
    private volatile String currentPtpStage = "IDLE";
    private volatile int currentOpCode = 0;
    private volatile int currentTxId = 0;
    private volatile int lastBulkReturn = 0;
    private volatile int lastRequestedBytes = 0;
    private volatile String lastBulkEndpoint = "";
    private volatile String lastFailureDetail = "";
    private volatile String lastHaltRecoveryStatus = "NOT_ATTEMPTED";
    private volatile String descriptorAuditText = "";

    // Incoming USB buffer stream
    private byte[] incoming = new byte[0];
    private int incomingLength = 0;
    private final byte[] readChunk = new byte[USB_READ_CHUNK];

    // Live View & HTTP Streaming
    private final AtomicBoolean isLiveViewRunning = new AtomicBoolean(false);
    private final AtomicBoolean isLiveViewPaused = new AtomicBoolean(false);
    private final AtomicBoolean isInterrupted = new AtomicBoolean(false);
    private final Set<Integer> supportedProperties = Collections.synchronizedSet(new HashSet<>());
    private volatile java.util.concurrent.CountDownLatch focusLockLatch = null;
    private Thread liveViewThread;
    private Thread eventThread;
    private LiveViewHttpServer liveViewServer;
    private volatile byte[] latestJpegFrame = null;
    private volatile long totalFramesReceived = 0;
    private volatile long totalFramesChanged = 0;
    private volatile long lastFrameCrc = 0;
    private volatile long lastFrameTimestamp = 0;
    private volatile double currentFps = 0.0;
    private volatile long firstValidFrameTimeMs = 0;
    private volatile long liveViewStartTimeMs = 0;
    private volatile int lastContainerType = 0;
    private volatile int lastContainerCode = 0;
    private volatile int lastContainerLength = 0;
    private volatile int lastContainerTxId = 0;

    // Listeners
    private CameraEventListener eventListener;
    private final Object usbLock = new Object();

    public interface CameraEventListener {
        void onPhotoCaptured(CapturedPhotoResult photo);
        void onCameraDisconnected();
        void onCameraError(String errorMessage);
        void onStateChanged(String state, String message);
        void onBatteryChanged(int percent);
    }

    public static final String BUILD_IDENTIFIER = "20261020-P0-SONY-SHUTTER-FIX-02";
    public static final int SONY_VENDOR_ID = 0x054C;
    private volatile String currentCorrelationId = "CORR_IDLE";

    public String getCurrentCorrelationId() {
        return currentCorrelationId;
    }

    public boolean isPropertySupported(int propCode) {
        return supportedProperties.contains(propCode);
    }

    public static class CapturedPhotoResult {
        public String photoId;
        public String nativeFilePath;
        public String dataUrl;
        public int width;
        public int height;
        public String format;
        public String correlationId;
        public String triggerSource; // "APP_SHUTTER" or "PHYSICAL_SHUTTER"
        public long tButtonToResponseMs;
        public long tResponseToTransferStartMs;
        public long tTransferDurationMs;
        public long tFileToUiMs;
        public long totalMs;

        public CapturedPhotoResult(String photoId, String nativeFilePath, String dataUrl, int width, int height, String format) {
            this(photoId, nativeFilePath, dataUrl, width, height, format, "CORR_UNKNOWN");
        }

        public CapturedPhotoResult(String photoId, String nativeFilePath, String dataUrl, int width, int height, String format, String correlationId) {
            this.photoId = photoId;
            this.nativeFilePath = nativeFilePath;
            this.dataUrl = dataUrl;
            this.width = width;
            this.height = height;
            this.format = format;
            this.correlationId = correlationId;
            this.triggerSource = "APP_SHUTTER";
            this.tButtonToResponseMs = 0;
            this.tResponseToTransferStartMs = 0;
            this.tTransferDurationMs = 0;
            this.tFileToUiMs = 0;
            this.totalMs = 0;
        }
    }

    public static class CameraInfo {
        public boolean isConnected;
        public String state;
        public String model;
        public String manufacturer;
        public String serialNumber;
        public int vendorId;
        public int productId;
        public int batteryLevel;
        public boolean isLiveViewStreaming;
        public String liveViewError;
        public double fps;
        public long totalFrames;

        public CameraInfo(boolean isConnected, String state, String model, String manufacturer, 
                          String serialNumber, int vendorId, int productId, int batteryLevel,
                          boolean isLiveViewStreaming, String liveViewError, double fps, long totalFrames) {
            this.isConnected = isConnected;
            this.state = state;
            this.model = model;
            this.manufacturer = manufacturer;
            this.serialNumber = serialNumber;
            this.vendorId = vendorId;
            this.productId = productId;
            this.batteryLevel = batteryLevel;
            this.isLiveViewStreaming = isLiveViewStreaming;
            this.liveViewError = liveViewError;
            this.fps = fps;
            this.totalFrames = totalFrames;
        }
    }

    public SonyPtpDriver(Context context) {
        this.context = context.getApplicationContext();
    }

    public String getCurrentState() {
        return currentState;
    }

    public String getLastErrorMessage() {
        return lastErrorMessage;
    }

    public String getLastDiagnosticReport() {
        return lastDiagnosticReport;
    }

    public String getLastSuccessfulStage() {
        return lastSuccessfulStage;
    }

    public String getFailedStage() {
        return failedStage;
    }

    public String getLastBulkEndpoint() {
        return lastBulkEndpoint;
    }

    public String getLastOpCode() {
        return String.format(Locale.US, "0x%04X (%s)", currentOpCode, getOpCodeName(currentOpCode));
    }

    public int getLastReturnCode() {
        return lastBulkReturn;
    }

    public String getLastHaltRecoveryStatus() {
        return lastHaltRecoveryStatus;
    }

    public String getLiveViewErrorMessage() {
        return liveViewErrorMessage;
    }

    public boolean isConnected() {
        return isConnected && connection != null;
    }

    public boolean isLiveViewStreaming() {
        return isLiveViewRunning.get() && latestJpegFrame != null;
    }

    public long getFirstValidFrameTimeMs() {
        return firstValidFrameTimeMs;
    }

    public int getLastContainerType() {
        return lastContainerType;
    }

    public int getLastContainerCode() {
        return lastContainerCode;
    }

    public int getLastContainerLength() {
        return lastContainerLength;
    }

    public int getLastContainerTxId() {
        return lastContainerTxId;
    }

    public CameraInfo getCameraInfo() {
        return new CameraInfo(
            isConnected(),
            currentState,
            cameraModel,
            manufacturer,
            serialNumber,
            usbDevice != null ? usbDevice.getVendorId() : 0x054C,
            usbDevice != null ? usbDevice.getProductId() : 0,
            lastBatteryPercent,
            isLiveViewStreaming(),
            liveViewErrorMessage,
            currentFps,
            totalFramesReceived
        );
    }

    private synchronized void updateDiagnosticReport() {
        StringBuilder sb = new StringBuilder();
        sb.append("=== MINGLEBOOTH SONY USB PTP DIAGNOSTIC AUDIT ===\n");
        sb.append(String.format(Locale.US, "Current State: %s\n", currentState));
        sb.append(String.format(Locale.US, "Last Successful Stage: %s\n", lastSuccessfulStage));
        sb.append(String.format(Locale.US, "First Failed Stage: %s\n", failedStage));
        sb.append(String.format(Locale.US, "Current/Last OpCode: 0x%04X (%s) | TxID: %d\n",
            currentOpCode, getOpCodeName(currentOpCode), currentTxId));
        sb.append(String.format(Locale.US, "Last Endpoint: %s | Requested: %dB | Return: %d\n",
            lastBulkEndpoint, lastRequestedBytes, lastBulkReturn));
        sb.append(String.format(Locale.US, "Halt Recovery Status: %s\n", lastHaltRecoveryStatus));
        if (firstValidFrameTimeMs > 0) {
            sb.append(String.format(Locale.US, "First Valid JPEG Frame: %dms after LV start\n", firstValidFrameTimeMs - liveViewStartTimeMs));
        }
        sb.append(String.format(Locale.US, "Last Container: Type=%d, Code=0x%04X (%s), Length=%d, TxID=%d\n",
            lastContainerType, lastContainerCode, getOpCodeName(lastContainerCode), lastContainerLength, lastContainerTxId));
        if (lastFailureDetail != null && !lastFailureDetail.isEmpty()) {
            sb.append(String.format(Locale.US, "Failure Detail: %s\n", lastFailureDetail));
        }
        if (lastErrorMessage != null && !lastErrorMessage.isEmpty()) {
            sb.append(String.format(Locale.US, "Last Error Message: %s\n", lastErrorMessage));
        }
        if (usbDevice != null) {
            sb.append(String.format(Locale.US, "USB Device: %s (VID: 0x%04X, PID: 0x%04X)\n",
                deviceDisplayName(usbDevice), usbDevice.getVendorId(), usbDevice.getProductId()));
        }
        if (usbInterface != null) {
            sb.append(String.format(Locale.US, "Claimed Interface: #%d (Class: 0x%02X - %s, SubClass: 0x%02X, Protocol: 0x%02X)\n",
                usbInterface.getId(), usbInterface.getInterfaceClass(),
                describeInterfaceClass(usbInterface.getInterfaceClass()),
                usbInterface.getInterfaceSubclass(), usbInterface.getInterfaceProtocol()));
        }
        if (bulkIn != null) {
            sb.append(String.format(Locale.US, "Bulk IN: 0x%02X (MaxPacket: %d, Type: BULK)\n",
                bulkIn.getAddress(), bulkIn.getMaxPacketSize()));
        }
        if (bulkOut != null) {
            sb.append(String.format(Locale.US, "Bulk OUT: 0x%02X (MaxPacket: %d, Type: BULK)\n",
                bulkOut.getAddress(), bulkOut.getMaxPacketSize()));
        }
        if (interruptIn != null) {
            sb.append(String.format(Locale.US, "Interrupt IN: 0x%02X (MaxPacket: %d, Type: INTERRUPT)\n",
                interruptIn.getAddress(), interruptIn.getMaxPacketSize()));
        }
        if (descriptorAuditText != null && !descriptorAuditText.isEmpty()) {
            sb.append("\n").append(descriptorAuditText);
        }
        sb.append("\n=================================================");
        this.lastDiagnosticReport = sb.toString();
    }

    private void setStageSuccess(String stage) {
        this.lastSuccessfulStage = stage;
        Log.i(TAG, "[PTP_STAGE_SUCCESS] " + stage);
        updateDiagnosticReport();
    }

    private void setStageFailed(String stage, String detail) {
        this.failedStage = stage;
        this.lastFailureDetail = detail;
        Log.e(TAG, "[PTP_STAGE_FAILED] " + stage + " -> " + detail);
        updateDiagnosticReport();
    }

    private static String deviceDisplayName(UsbDevice dev) {
        if (dev == null) return "Unknown";
        String p = dev.getProductName();
        if (p != null && !p.trim().isEmpty()) return p;
        return dev.getDeviceName();
    }

    private void updateState(String newState, String message) {
        this.currentState = newState;
        Log.i(TAG, "[STATE_TRANSITION] " + newState + " -> " + message);
        updateDiagnosticReport();
        if (eventListener != null) {
            eventListener.onStateChanged(newState, message);
        }
    }

    // --- Main USB Connection & PTP Handshake Sequence ---

    public boolean connect(UsbDevice device, UsbDeviceConnection conn, CameraEventListener listener) {
        synchronized (usbLock) {
            this.eventListener = listener;

            // Retained instance check: If already connected to the exact same device, keep connection!
            if (isConnected && connection != null && usbDevice != null 
                    && usbDevice.getDeviceId() == device.getDeviceId() && isSessionOpen) {
                Log.i(TAG, "[CONNECT_RETAIN] Connection already active on device " + device.getDeviceName() 
                    + " (" + cameraModel + "). Preserving PTP session across configuration changes.");
                updateState(isLiveViewRunning.get() && latestJpegFrame != null ? STATE_LIVE_VIEW_STREAMING : STATE_CAMERA_READY, 
                    "Koneksi kamera aktif dipertahankan (" + cameraModel + ").");
                return true;
            }

            if (isConnected) {
                disconnectInternal(false);
            }

            this.usbDevice = device;
            this.connection = conn;
            this.isInterrupted.set(false);
            this.lastErrorMessage = "";
            this.liveViewErrorMessage = "";
            this.incoming = new byte[0];
            this.incomingLength = 0;
            this.transactionId = 0;

            // 0. Defensive sanity check: Ensure device is not a known non-camera device (e.g. Realtek Ethernet)
            if (device.getVendorId() == 0x0BDA || device.getVendorId() == 0x0B95) {
                lastErrorMessage = String.format(Locale.US,
                    "Perangkat USB yang terhubung (VID: 0x%04X, PID: 0x%04X) adalah adapter Ethernet, bukan kamera Sony. PTP OpenSession dibatalkan.",
                    device.getVendorId(), device.getProductId());
                setStageFailed("DEVICE_VALIDATION", lastErrorMessage);
                Log.e(TAG, "[DEVICE_REJECTED] " + lastErrorMessage);
                updateState(STATE_ERROR, lastErrorMessage);
                conn.close();
                return false;
            }

            Log.i(TAG, "==================== SONY USB PTP CONNECTION INITIATED ====================");
            updateState(STATE_USB_CONNECTED, "USB terhubung ke " + deviceDisplayName(device) + ".");
            updateState(STATE_USB_DEVICE_DETECTED, "Perangkat USB terdeteksi (VID: 0x" 
                + Integer.toHexString(device.getVendorId()).toUpperCase(Locale.US) + ", PID: 0x" 
                + Integer.toHexString(device.getProductId()).toUpperCase(Locale.US) + ").");
            updateState(STATE_USB_PERMISSION_GRANTED, "Izin USB Host diberikan oleh sistem Android.");
            setStageSuccess("USB_PERMISSION_GRANTED");

            // 1. Audit and dump full USB descriptors (Configurations, Interfaces, Endpoints)
            dumpDeviceDescriptors(device, conn);

            // 2. Discover and Score Candidate Interfaces
            List<PtpInterfaceCandidate> candidates = findPtpCandidates(device);
            if (candidates.isEmpty()) {
                lastErrorMessage = "Interface USB PTP kamera tidak ditemukan (tidak ada pasangan Bulk IN/OUT). Pastikan mode USB kamera diatur ke 'PC Remote'.";
                setStageFailed("DISCOVER_CANDIDATES", lastErrorMessage);
                Log.e(TAG, "[STEP_ERROR] " + lastErrorMessage);
                updateState(STATE_ERROR, lastErrorMessage);
                conn.close();
                return false;
            }

            Log.i(TAG, "[CANDIDATE_SEARCH] Found " + candidates.size() + " candidate interface(s) with Bulk IN/OUT pairs.");
            setStageSuccess("FOUND_" + candidates.size() + "_CANDIDATE_INTERFACES");

            boolean sessionEstablished = false;
            String lastTrialFailureReason = "";

            // 3. Multi-Candidate Trial Loop: Test OpenSession on candidates in priority order
            for (int idx = 0; idx < candidates.size(); idx++) {
                PtpInterfaceCandidate candidate = candidates.get(idx);
                Log.i(TAG, String.format(Locale.US, "[CANDIDATE_TRIAL #%d] Testing Interface #%d (%s, Score=%d, BulkOUT=0x%02X, BulkIN=0x%02X)...",
                    idx + 1, candidate.iface.getId(), candidate.reason, candidate.score,
                    candidate.bulkOut.getAddress(), candidate.bulkIn.getAddress()));

                currentPtpStage = "CLAIM_INTERFACE_#" + candidate.iface.getId();
                if (!conn.claimInterface(candidate.iface, true)) {
                    String failMsg = "Gagal mengklaim Interface #" + candidate.iface.getId() + " (claimInterface returned false)";
                    Log.w(TAG, "[CANDIDATE_TRIAL] " + failMsg + ", mencoba kandidat berikutnya...");
                    setStageFailed(currentPtpStage, failMsg);
                    continue;
                }

                setStageSuccess("CLAIM_INTERFACE_#" + candidate.iface.getId() + "_OK");
                this.usbInterface = candidate.iface;
                this.bulkIn = candidate.bulkIn;
                this.bulkOut = candidate.bulkOut;
                this.interruptIn = candidate.interruptIn;
                this.isTransportOpen = true;
                this.incoming = new byte[0];
                this.incomingLength = 0;
                this.transactionId = 0;

                Log.i(TAG, String.format(Locale.US,
                    "[INTERFACE_CLAIMED] Claimed Interface #%d (AltSetting=%d, Class=0x%02X, SubClass=0x%02X, Protocol=0x%02X, BulkOUT=0x%02X [MaxPacket=%d], BulkIN=0x%02X [MaxPacket=%d], IntIN=%s)",
                    candidate.iface.getId(), candidate.iface.getAlternateSetting(),
                    candidate.iface.getInterfaceClass(), candidate.iface.getInterfaceSubclass(), candidate.iface.getInterfaceProtocol(),
                    candidate.bulkOut.getAddress(), candidate.bulkOut.getMaxPacketSize(),
                    candidate.bulkIn.getAddress(), candidate.bulkIn.getMaxPacketSize(),
                    candidate.interruptIn != null ? String.format(Locale.US, "0x%02X [MaxPacket=%d]", candidate.interruptIn.getAddress(), candidate.interruptIn.getMaxPacketSize()) : "none"));

                // Query and only clear halt if endpoint is actually stalled.
                // Blindly calling clearEndpointHalt resets the USB data toggle to DATA0 and causes protocol desynchronization.
                if (isEndpointHalted(conn, bulkOut)) {
                    Log.i(TAG, "[CONNECT_CHECK] Bulk OUT 0x" + Integer.toHexString(bulkOut.getAddress()) + " is halted. Clearing halt...");
                    clearEndpointHalt(conn, bulkOut);
                }
                if (isEndpointHalted(conn, bulkIn)) {
                    Log.i(TAG, "[CONNECT_CHECK] Bulk IN 0x" + Integer.toHexString(bulkIn.getAddress()) + " is halted. Clearing halt...");
                    clearEndpointHalt(conn, bulkIn);
                }

                try {
                    // Test PTP OpenSession (Session ID: 1, TxID: 0)
                    currentPtpStage = "OPENSESSION_WRITE";
                    Log.i(TAG, "[CANDIDATE_TRIAL] Mengirim PTP OpenSession(1) pada Interface #" + candidate.iface.getId() + "...");
                    sendCommand(PTP_OC_OpenSession, 1);
                    setStageSuccess("OPENSESSION_WRITE_OK");

                    currentPtpStage = "OPENSESSION_READ_RESPONSE";
                    int openCode = readUntilResponse("OpenSession");

                    if (openCode == PTP_RC_OK || openCode == PTP_RC_SessionAlreadyOpen) {
                        Log.i(TAG, "[CANDIDATE_SUCCESS] Interface #" + candidate.iface.getId() 
                            + " berhasil merespons OpenSession (0x" + Integer.toHexString(openCode) + ")! Menggunakan interface ini.");
                        sessionEstablished = true;
                        isSessionOpen = true;
                        setStageSuccess("OPENSESSION_RESPONSE_OK (0x" + Integer.toHexString(openCode) + ")");
                        updateState(STATE_USB_INTERFACE_CLAIMED, "Interface USB kamera berhasil diklaim (Interface #" + candidate.iface.getId() + ").");
                        updateState(STATE_PTP_SESSION_OPEN, "Sesi PTP terbuka (OpenSession OK).");
                        break;
                    } else {
                        throw new IOException(String.format(Locale.US, "OpenSession gagal dengan response code 0x%04X", openCode));
                    }
                } catch (Throwable trialEx) {
                    lastTrialFailureReason = trialEx.getMessage();
                    setStageFailed(currentPtpStage, lastTrialFailureReason);
                    Log.w(TAG, "[CANDIDATE_FAIL] Interface #" + candidate.iface.getId() + " gagal saat uji OpenSession: " + lastTrialFailureReason);
                    try {
                        conn.releaseInterface(candidate.iface);
                    } catch (Throwable ignored) {}
                    this.usbInterface = null;
                    this.bulkIn = null;
                    this.bulkOut = null;
                    this.interruptIn = null;
                    this.isTransportOpen = false;
                    this.incoming = new byte[0];
                    this.incomingLength = 0;
                }
            }

            if (!sessionEstablished) {
                lastErrorMessage = "Gagal membuka sesi PTP pada semua interface USB yang terdeteksi: " + lastTrialFailureReason;
                setStageFailed("OPENSESSION_ALL_CANDIDATES_FAILED", lastErrorMessage);
                Log.e(TAG, "[STEP_ERROR] " + lastErrorMessage);
                updateState(STATE_ERROR, lastErrorMessage);
                conn.close();
                return false;
            }

            try {
                // 4. PTP GetDeviceInfo
                currentPtpStage = "GET_DEVICE_INFO";
                Log.i(TAG, "[PTP_STEP 2: GET_DEVICE_INFO] Sending GetDeviceInfo...");
                sendCommand(PTP_OC_GetDeviceInfo);
                int devInfoCode = readUntilResponse("GetDeviceInfo");
                if (devInfoCode != PTP_RC_OK) {
                    Log.w(TAG, "GetDeviceInfo returned 0x" + Integer.toHexString(devInfoCode));
                } else {
                    setStageSuccess("GET_DEVICE_INFO_OK");
                }

                // 5. PTP GetStorageIDs (0x1004) - Mandatory prior to Sony SDIO on A6300/A6400
                currentPtpStage = "GET_STORAGE_IDS";
                Log.i(TAG, "[PTP_STEP 3: GET_STORAGE_IDS] Sending GetStorageIDs (0x1004)...");
                sendCommand(PTP_OC_GetStorageIDs);
                int storageCode = readUntilResponse("GetStorageIDs");
                expectOk("GetStorageIDs", storageCode);
                setStageSuccess("GET_STORAGE_IDS_OK");

                // 6. Sony SDIO Handshake Phase 1 (0x9201, params: 1, 0, 0)
                currentPtpStage = "SONY_SDIO_CONNECT_PHASE_1";
                Log.i(TAG, "[SONY_HANDSHAKE: PHASE 1] Sending SONY_SDIOConnect(1, 0, 0)...");
                sendCommand(PTP_OC_SONY_SDIOConnect, 1, 0, 0);
                int sdio1 = readUntilResponse("Sony SDIO_Connect phase 1");
                expectOk("Sony SDIO_Connect phase 1", sdio1);
                setStageSuccess("SONY_SDIO_CONNECT_PHASE_1_OK");

                // 7. Sony SDIO Handshake Phase 2 (0x9201, params: 2, 0, 0)
                currentPtpStage = "SONY_SDIO_CONNECT_PHASE_2";
                Log.i(TAG, "[SONY_HANDSHAKE: PHASE 2] Sending SONY_SDIOConnect(2, 0, 0)...");
                sendCommand(PTP_OC_SONY_SDIOConnect, 2, 0, 0);
                int sdio2 = readUntilResponse("Sony SDIO_Connect phase 2");
                expectOk("Sony SDIO_Connect phase 2", sdio2);
                setStageSuccess("SONY_SDIO_CONNECT_PHASE_2_OK");

                // 8. Sony SDIO GetExtDeviceInfo (0x9202, param: 0xC8)
                currentPtpStage = "SONY_SDIO_GET_EXT_DEVICE_INFO_1";
                Log.i(TAG, "[SONY_HANDSHAKE: EXT_INFO] Sending SONY_GetSDIOGetExtDeviceInfo(0xC8)...");
                sendCommand(PTP_OC_SONY_GetSDIOGetExtDeviceInfo, 0xC8);
                int extInfo1 = readUntilResponse("Sony SDIO_GetExtDeviceInfo");
                expectOk("Sony SDIO_GetExtDeviceInfo", extInfo1);
                setStageSuccess("SONY_SDIO_GET_EXT_DEVICE_INFO_1_OK");

                // 9. Sony SDIO Handshake Phase 3 (0x9201, params: 3, 0, 0)
                currentPtpStage = "SONY_SDIO_CONNECT_PHASE_3";
                Log.i(TAG, "[SONY_HANDSHAKE: PHASE 3] Sending SONY_SDIOConnect(3, 0, 0)...");
                sendCommand(PTP_OC_SONY_SDIOConnect, 3, 0, 0);
                int sdio3 = readUntilResponse("Sony SDIO_Connect phase 3");
                expectOk("Sony SDIO_Connect phase 3", sdio3);
                setStageSuccess("SONY_SDIO_CONNECT_PHASE_3_OK");

                // 10. Sony SDIO GetExtDeviceInfo Refresh (0x9202, param: 0xC8)
                currentPtpStage = "SONY_SDIO_GET_EXT_DEVICE_INFO_2";
                Log.i(TAG, "[SONY_HANDSHAKE: EXT_INFO_REFRESH] Sending SONY_GetSDIOGetExtDeviceInfo(0xC8) refresh...");
                sendCommand(PTP_OC_SONY_GetSDIOGetExtDeviceInfo, 0xC8);
                int extInfo2 = readUntilResponse("Sony SDIO_GetExtDeviceInfo refresh");
                expectOk("Sony SDIO_GetExtDeviceInfo refresh", extInfo2);
                setStageSuccess("SONY_SDIO_GET_EXT_DEVICE_INFO_2_OK");

                // 11. Configure Sony camera properties for Desktop SDK parity
                currentPtpStage = "SONY_SETUP_CAMERA_PROPERTIES";
                setupCameraProperties();
                setStageSuccess("SONY_SETUP_CAMERA_PROPERTIES_OK");

                // 12. Start Interrupt Event Endpoint Reader Thread
                currentPtpStage = "START_INTERRUPT_EVENT_READER";
                startInterruptEventReader();
                setStageSuccess("START_INTERRUPT_EVENT_READER_OK");

                isConnected = true;
                currentPtpStage = "CAMERA_READY";
                setStageSuccess("CAMERA_READY");
                Log.i(TAG, "[PTP_SUCCESS] SONY SDIO PC Remote handshake complete! Camera: " + cameraModel 
                    + " (" + manufacturer + ", S/N: " + serialNumber + ")");
                updateState(STATE_CAMERA_READY, "Kamera Sony (" + cameraModel + ") siap digunakan.");

                return true;
            } catch (Throwable t) {
                lastErrorMessage = "Gagal menyelesaikan inisialisasi PTP Sony: " + t.getMessage();
                setStageFailed(currentPtpStage, lastErrorMessage);
                Log.e(TAG, "[PTP_INIT_EXCEPTION] " + lastErrorMessage, t);
                updateState(STATE_ERROR, lastErrorMessage);
                disconnectInternal(true);
                return false;
            }
        }
    }

    private void setupCameraProperties() {
        Log.i(TAG, "[SETUP] Configuring camera properties for PC Remote parity with desktop SDK...");
        
        // 1. PriorityKeySettings (0xD229)
        // Strictly set PriorityKey to CameraPosition (0x0001) so that physical shutter and camera body buttons are prioritized.
        try {
            int res = setControlDeviceB(SONY_DPC_PRIORITY_KEY, 0x0001);
            Log.i(TAG, "[SETUP] SONY_DPC_PRIORITY_KEY set to CameraPosition (0x0001), res=0x" + Integer.toHexString(res));
        } catch (Throwable t) {
            Log.w(TAG, "[SETUP] Setting PriorityKeySettings notice (skipping if unsupported on model): " + t.getMessage());
        }

        // Note: SONY_DPC_STILL_IMAGE_STORE_DESTINATION (0xD222) and SONY_DPC_STILL_IMAGE_TRANS_SIZE (0xD223)
        // are Device Properties, not Control Codes. In Sony PC Remote mode for A6400, these are configured
        // in the camera body menu ("Still Img. Save Dest." -> PC+Camera). Calling 0x9207 (SetControlDeviceB)
        // on them is invalid and causes PTP parameter errors (0x2005).
        Log.i(TAG, "[SETUP] PC Remote destination configured on camera body menu: PC+Camera recommended.");
    }

    private void expectOk(String operation, int responseCode) throws IOException {
        if (responseCode != PTP_RC_OK) {
            throw new IOException(String.format(Locale.US, "%s gagal dengan kode response PTP 0x%04X", operation, responseCode));
        }
    }

    private boolean hasBulkEndpoints(UsbInterface usbInterface) {
        boolean in = false;
        boolean out = false;
        for (int i = 0; i < usbInterface.getEndpointCount(); i++) {
            UsbEndpoint endpoint = usbInterface.getEndpoint(i);
            if (endpoint.getType() != UsbConstants.USB_ENDPOINT_XFER_BULK) continue;
            if (endpoint.getDirection() == UsbConstants.USB_DIR_IN) in = true;
            if (endpoint.getDirection() == UsbConstants.USB_DIR_OUT) out = true;
        }
        return in && out;
    }

    // --- Helper Methods for PTP Diagnostics, Interface Ranking and USB Recovery ---

    public static class PtpInterfaceCandidate {
        public final UsbInterface iface;
        public final UsbEndpoint bulkIn;
        public final UsbEndpoint bulkOut;
        public final UsbEndpoint interruptIn;
        public final int score;
        public final String reason;

        public PtpInterfaceCandidate(UsbInterface iface, UsbEndpoint bulkIn, UsbEndpoint bulkOut, UsbEndpoint interruptIn, int score, String reason) {
            this.iface = iface;
            this.bulkIn = bulkIn;
            this.bulkOut = bulkOut;
            this.interruptIn = interruptIn;
            this.score = score;
            this.reason = reason;
        }
    }

    private List<PtpInterfaceCandidate> findPtpCandidates(UsbDevice device) {
        List<PtpInterfaceCandidate> candidates = new ArrayList<>();

        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface iface = device.getInterface(i);
            UsbEndpoint primaryBulkIn = null;
            UsbEndpoint primaryBulkOut = null;
            UsbEndpoint primaryIntIn = null;

            for (int e = 0; e < iface.getEndpointCount(); e++) {
                UsbEndpoint ep = iface.getEndpoint(e);
                int type = ep.getType();
                int dir = ep.getDirection();

                if (type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                    if (dir == UsbConstants.USB_DIR_IN && primaryBulkIn == null) {
                        primaryBulkIn = ep;
                    } else if (dir == UsbConstants.USB_DIR_OUT && primaryBulkOut == null) {
                        primaryBulkOut = ep;
                    }
                } else if (type == UsbConstants.USB_ENDPOINT_XFER_INT && dir == UsbConstants.USB_DIR_IN && primaryIntIn == null) {
                    primaryIntIn = ep;
                }
            }

            if (primaryBulkIn != null && primaryBulkOut != null) {
                int ifClass = iface.getInterfaceClass();
                int ifSub = iface.getInterfaceSubclass();
                int ifProto = iface.getInterfaceProtocol();

                int score;
                String reason;

                if (ifClass == UsbConstants.USB_CLASS_STILL_IMAGE) {
                    if (ifSub == 1 && ifProto == 1) {
                        score = 1000;
                        reason = "Standard Still Image PTP (Class 6, Subclass 1, Protocol 1)";
                    } else {
                        score = 900;
                        reason = "USB Still Image Class 6";
                    }
                } else if (ifClass == 0xFF) {
                    if (device.getVendorId() == SONY_VENDOR_ID) {
                        if (ifSub == 1 && ifProto == 1) {
                            score = 850;
                            reason = "Sony Vendor Specific Subclass 1 Protocol 1";
                        } else if (primaryIntIn != null) {
                            score = 800;
                            reason = "Sony Vendor Specific with Interrupt Event Endpoint (PC Remote)";
                        } else {
                            score = 700;
                            reason = "Sony Vendor Specific Bulk Pair";
                        }
                    } else {
                        // Non-Sony vendor-specific interface (e.g. Realtek Ethernet, serial chips, etc.) - NEVER a PTP candidate!
                        continue;
                    }
                } else {
                    // Non-StillImage and non-Sony bulk pairs are not valid PTP interfaces
                    continue;
                }

                candidates.add(new PtpInterfaceCandidate(iface, primaryBulkIn, primaryBulkOut, primaryIntIn, score, reason));
            }
        }

        Collections.sort(candidates, (a, b) -> Integer.compare(b.score, a.score));
        return candidates;
    }

    public static boolean isEndpointHalted(UsbDeviceConnection conn, UsbEndpoint ep) {
        if (conn == null || ep == null) return false;
        try {
            byte[] status = new byte[2];
            // bmRequestType: 0x82 (Device-to-Host, Standard Request, Recipient: Endpoint)
            // bRequest: 0x00 (GET_STATUS)
            // wValue: 0x0000
            // wIndex: Endpoint address (e.g. 0x81 or 0x02)
            int res = conn.controlTransfer(0x82, 0x00, 0x0000, ep.getAddress(), status, 2, 1000);
            if (res >= 2) {
                boolean halted = (status[0] & 0x01) != 0;
                Log.d(TAG, String.format(Locale.US, "[EP_STATUS] Endpoint 0x%02X -> status=0x%02X%02X, halted=%b",
                    ep.getAddress(), status[1], status[0], halted));
                return halted;
            }
        } catch (Throwable t) {
            Log.w(TAG, "[EP_STATUS_WARN] Failed to query halt status on endpoint 0x" 
                + Integer.toHexString(ep.getAddress()) + ": " + t.getMessage());
        }
        return false;
    }

    public static boolean clearEndpointHalt(UsbDeviceConnection conn, UsbEndpoint ep) {
        if (conn == null || ep == null) return false;
        try {
            // Standard USB Request: CLEAR_FEATURE (0x01), Feature: ENDPOINT_HALT (0x00)
            // bmRequestType: 0x02 (Recipient: Endpoint, Type: Standard, Dir: Host-to-Device)
            int res = conn.controlTransfer(0x02, 0x01, 0x0000, ep.getAddress(), null, 0, 1000);
            Log.i(TAG, String.format(Locale.US, "[CLEAR_HALT] Endpoint 0x%02X -> CLEAR_FEATURE(ENDPOINT_HALT) result: %d",
                ep.getAddress(), res));
            return res >= 0;
        } catch (Throwable t) {
            Log.w(TAG, "[CLEAR_HALT_WARN] Failed to clear halt on endpoint 0x" 
                + Integer.toHexString(ep.getAddress()) + ": " + t.getMessage());
            return false;
        }
    }

    public static String getOpCodeName(int code) {
        switch (code) {
            case PTP_OC_GetDeviceInfo: return "GetDeviceInfo";
            case PTP_OC_OpenSession: return "OpenSession";
            case PTP_OC_CloseSession: return "CloseSession";
            case PTP_OC_GetStorageIDs: return "GetStorageIDs";
            case PTP_OC_GetStorageInfo: return "GetStorageInfo";
            case PTP_OC_GetObjectHandles: return "GetObjectHandles";
            case PTP_OC_GetObjectInfo: return "GetObjectInfo";
            case PTP_OC_GetObject: return "GetObject";
            case PTP_OC_InitiateCapture: return "InitiateCapture";
            case PTP_OC_GetDevicePropDesc: return "GetDevicePropDesc";
            case PTP_OC_GetDevicePropValue: return "GetDevicePropValue";
            case PTP_OC_SetDevicePropValue: return "SetDevicePropValue";
            case PTP_OC_SONY_SDIOConnect: return "SONY_SDIOConnect";
            case PTP_OC_SONY_SDIOGetExtDeviceInfo: return "SONY_SDIOGetExtDeviceInfo";
            case PTP_OC_SONY_SetControlDeviceB: return "SONY_SetControlDeviceB";
            case PTP_OC_SONY_GetAllExtDeviceInfo: return "SONY_GetAllExtDeviceInfo";
            case PTP_EC_Sony_ObjectAdded: return "SONY_EC_ObjectAdded";
            case PTP_EC_Sony_ObjectRemoved: return "SONY_EC_ObjectRemoved";
            case PTP_EC_Sony_PropertyChanged: return "SONY_EC_PropertyChanged";
            case PTP_EC_ObjectAdded: return "EC_ObjectAdded";
            case SONY_DPC_S1_BUTTON: return "SONY_DPC_S1_BUTTON";
            case SONY_DPC_S2_BUTTON: return "SONY_DPC_S2_BUTTON";
            case SONY_DPC_S1_AND_S2_BUTTON: return "SONY_DPC_S1_AND_S2_BUTTON";
            case SONY_DPC_REQUEST_ONE_SHOOTING: return "SONY_DPC_REQUEST_ONE_SHOOTING";
            case SONY_DPC_SHOOTING_FILE_INFO: return "SONY_DPC_SHOOTING_FILE_INFO";
            case SONY_DPC_PRIORITY_KEY: return "SONY_DPC_PRIORITY_KEY";
            default: return String.format(Locale.US, "0x%04X", code);
        }
    }

    private String buildWriteFailureDiagnostic(int code, int[] params, int txId, int totalLen, int offset, int remaining, int lastWritten, int retryAttempt) {
        StringBuilder sb = new StringBuilder();
        sb.append("PTP command write failed: ").append(lastWritten).append(" bytes written instead of ").append(totalLen);
        sb.append(" (offset=").append(offset).append(", remaining=").append(remaining);
        sb.append(", retry=").append(retryAttempt).append("/3). ");
        sb.append("OpCode=0x").append(String.format(Locale.US, "%04X", code)).append(" (").append(getOpCodeName(code)).append(")");
        sb.append(", TxID=").append(txId);
        if (usbDevice != null) {
            sb.append(", VID=0x").append(Integer.toHexString(usbDevice.getVendorId()).toUpperCase(Locale.US));
            sb.append(", PID=0x").append(Integer.toHexString(usbDevice.getProductId()).toUpperCase(Locale.US));
        }
        if (usbInterface != null) {
            sb.append(", Interface=#").append(usbInterface.getId());
            sb.append(" (Class=0x").append(Integer.toHexString(usbInterface.getInterfaceClass()).toUpperCase(Locale.US));
            sb.append(", SubClass=0x").append(Integer.toHexString(usbInterface.getInterfaceSubclass()).toUpperCase(Locale.US));
            sb.append(", Protocol=0x").append(Integer.toHexString(usbInterface.getInterfaceProtocol()).toUpperCase(Locale.US)).append(")");
        }
        if (bulkOut != null) {
            sb.append(", BulkOUT=0x").append(Integer.toHexString(bulkOut.getAddress()).toUpperCase(Locale.US));
            sb.append(" (maxPacket=").append(bulkOut.getMaxPacketSize()).append(")");
        }
        if (bulkIn != null) {
            sb.append(", BulkIN=0x").append(Integer.toHexString(bulkIn.getAddress()).toUpperCase(Locale.US));
        }
        sb.append(", ConnectionOpen=").append(connection != null);
        return sb.toString();
    }

    private String dumpDeviceDescriptors(UsbDevice device, UsbDeviceConnection conn) {
        StringBuilder sb = new StringBuilder();
        sb.append("=== USB DEVICE DESCRIPTOR AUDIT ===\n");
        sb.append(String.format(Locale.US, "Device: %s\n", device.getDeviceName()));
        try {
            sb.append(String.format(Locale.US, "Manufacturer: '%s' | Product: '%s'\n",
                device.getManufacturerName() != null ? device.getManufacturerName() : "N/A",
                device.getProductName() != null ? device.getProductName() : "N/A"));
        } catch (Throwable ignored) {}
        sb.append(String.format(Locale.US, "VID: 0x%04X | PID: 0x%04X\n", device.getVendorId(), device.getProductId()));
        sb.append(String.format(Locale.US, "DeviceClass: 0x%02X | Subclass: 0x%02X | Protocol: 0x%02X\n",
            device.getDeviceClass(), device.getDeviceSubclass(), device.getDeviceProtocol()));
        sb.append(String.format(Locale.US, "Configurations: %d | Interfaces: %d\n",
            device.getConfigurationCount(), device.getInterfaceCount()));

        for (int c = 0; c < device.getConfigurationCount(); c++) {
            UsbConfiguration conf = device.getConfiguration(c);
            sb.append(String.format(Locale.US, " Config #%d: ID=%d, Name='%s', MaxPower=%dmA, Interfaces=%d\n",
                c, conf.getId(), conf.getName(), conf.getMaxPower(), conf.getInterfaceCount()));
        }

        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface iface = device.getInterface(i);
            String classDesc = describeInterfaceClass(iface.getInterfaceClass());
            sb.append(String.format(Locale.US, " Interface #%d: ID=%d, AltSetting=%d, Class=0x%02X (%s), SubClass=0x%02X, Protocol=0x%02X, Endpoints=%d\n",
                i, iface.getId(), iface.getAlternateSetting(), iface.getInterfaceClass(), classDesc,
                iface.getInterfaceSubclass(), iface.getInterfaceProtocol(), iface.getEndpointCount()));

            for (int e = 0; e < iface.getEndpointCount(); e++) {
                UsbEndpoint ep = iface.getEndpoint(e);
                String dir = ep.getDirection() == UsbConstants.USB_DIR_IN ? "IN" : "OUT";
                String typeStr = describeEndpointType(ep.getType());
                sb.append(String.format(Locale.US, "   Endpoint #%d: Addr=0x%02X, Dir=%s, Type=%s, MaxPacket=%d, Interval=%d\n",
                    e, ep.getAddress(), dir, typeStr, ep.getMaxPacketSize(), ep.getInterval()));
            }
        }
        sb.append("===================================");
        String report = sb.toString();
        Log.i(TAG, report);
        this.descriptorAuditText = report;
        updateDiagnosticReport();
        return report;
    }

    private static String describeInterfaceClass(int cls) {
        switch (cls) {
            case UsbConstants.USB_CLASS_STILL_IMAGE: return "STILL_IMAGE/PTP (0x06)";
            case UsbConstants.USB_CLASS_MASS_STORAGE: return "MASS_STORAGE (0x08)";
            case UsbConstants.USB_CLASS_VENDOR_SPEC: return "VENDOR_SPECIFIC (0xFF)";
            case UsbConstants.USB_CLASS_COMM: return "COMM (0x02)";
            case UsbConstants.USB_CLASS_HID: return "HID (0x03)";
            case UsbConstants.USB_CLASS_PHYSICA: return "PHYSICAL (0x05)";
            case UsbConstants.USB_CLASS_PRINTER: return "PRINTER (0x07)";
            case UsbConstants.USB_CLASS_HUB: return "HUB (0x09)";
            case UsbConstants.USB_CLASS_CDC_DATA: return "CDC_DATA (0x0A)";
            case UsbConstants.USB_CLASS_CSCID: return "SMART_CARD (0x0B)";
            case UsbConstants.USB_CLASS_CONTENT_SEC: return "CONTENT_SECURITY (0x0D)";
            case UsbConstants.USB_CLASS_VIDEO: return "VIDEO (0x0E)";
            case UsbConstants.USB_CLASS_WIRELESS_CONTROLLER: return "WIRELESS (0xE0)";
            case UsbConstants.USB_CLASS_MISC: return "MISC (0xEF)";
            case UsbConstants.USB_CLASS_APP_SPEC: return "APP_SPEC (0xFE)";
            default: return String.format(Locale.US, "0x%02X", cls);
        }
    }

    private static String describeEndpointType(int type) {
        switch (type) {
            case UsbConstants.USB_ENDPOINT_XFER_BULK: return "BULK";
            case UsbConstants.USB_ENDPOINT_XFER_INT: return "INTERRUPT";
            case UsbConstants.USB_ENDPOINT_XFER_CONTROL: return "CONTROL";
            case UsbConstants.USB_ENDPOINT_XFER_ISOC: return "ISOCHRONOUS";
            default: return String.valueOf(type);
        }
    }

    // --- Interrupt Event Listener Thread (Prevents Sony Pipe Stall & Detects Physical Shutter) ---

    private void startInterruptEventReader() {
        if (interruptIn == null) return;

        eventThread = new Thread(() -> {
            Log.i(TAG, "[EVENT_THREAD] Started on endpoint 0x" + Integer.toHexString(interruptIn.getAddress()));
            byte[] eventBuf = new byte[128];

            while (isConnected && !isInterrupted.get()) {
                try {
                    int read = connection.bulkTransfer(interruptIn, eventBuf, eventBuf.length, 1000);
                    if (read >= 12) {
                        ByteBuffer bb = ByteBuffer.wrap(eventBuf, 0, read).order(ByteOrder.LITTLE_ENDIAN);
                        int len = bb.getInt();
                        short type = bb.getShort();
                        short eventCode = bb.getShort();
                        int txId = bb.getInt();
                        int codeUnsigned = eventCode & 0xFFFF;
                        String corr = currentCorrelationId != null ? currentCorrelationId : "IDLE";

                        int param1 = bb.remaining() >= 4 ? bb.getInt() : 0;
                        int param2 = bb.remaining() >= 4 ? bb.getInt() : -1;

                        Log.i(TAG, String.format(Locale.US, "⚡ [%s] [STAGE_3:INTERRUPT_PACKET] Code=0x%04X (%s), Len=%d, Type=%d, TxID=%d, Param1=0x%08X, Param2=0x%08X",
                            corr, codeUnsigned, getOpCodeName(codeUnsigned), len, type, txId, param1, param2));

                        boolean isCaptureEvent = false;
                        int objectHandle = -1;

                        if (codeUnsigned == PTP_EC_Sony_ObjectAdded || codeUnsigned == PTP_EC_ObjectAdded) {
                            // Real new image object in RAM or SD card: valid for software latch completion or physical shutter
                            isCaptureEvent = true;
                            objectHandle = isValidObjectHandle(param1) ? param1 : SONY_SHOT_OBJECT_HANDLE;
                            Log.i(TAG, String.format(Locale.US, "⚡ [%s] [CAMERA_EVENT_CONFIRMATION] ObjectAdded event 0x%04X: ObjectHandle=0x%08X",
                                corr, codeUnsigned, objectHandle));
                        } else if (codeUnsigned == 0x400D) { // PTP_EC_CaptureComplete
                            // CaptureComplete emitted by camera firmware on completion of physical or software exposure
                            isCaptureEvent = true;
                            objectHandle = SONY_SHOT_OBJECT_HANDLE;
                            Log.i(TAG, String.format(Locale.US, "⚡ [%s] [CAMERA_EVENT_CONFIRMATION] Event 0x400D (CaptureComplete): RAM buffer signaled (software=%b)", corr, isSoftwareCapturing));
                        } else if (codeUnsigned == PTP_EC_Sony_PropertyChanged || codeUnsigned == PTP_EC_DevicePropChanged) {
                            // Standard PTP Property Changed (0x4006) or Sony Property Changed (0xC203)
                            // MUST NEVER TRIGGER CAPTURE! These are routine state updates emitted on idle/metering/startup.
                            int propCode = param1 & 0xFFFF;
                            Log.d(TAG, String.format(Locale.US, "📋 [%s] [STAGE_3:PROP_CHANGED] Prop=0x%04X (%s), Param2=0x%08X",
                                corr, propCode, getOpCodeName(propCode), param2));
                            if (propCode == SONY_DPC_FOCUS_INDICATION) {
                                Log.i(TAG, String.format(Locale.US, "🎯 [%s] [STAGE_2:FOCUS_SIGNAL] Focus Indication 0xD213 updated on interrupt endpoint.", corr));
                                if (focusLockLatch != null) {
                                    focusLockLatch.countDown();
                                }
                            } else if (propCode == SONY_DPC_SHOOTING_FILE_INFO) {
                                // Property 0xD215 (ObjectInMemory) telemetry only - NOT a capture trigger
                                boolean isReady = (param2 != -1 && (param2 & 0x8000) != 0);
                                Log.d(TAG, String.format(Locale.US,
                                    "ℹ️ [%s] [STAGE_3:SHOOTING_FILE_INFO] Property 0xD215 update (Param2=0x%08X, HighBitReady=%b)",
                                    corr, param2, isReady));
                            }
                        }

                        if (isCaptureEvent) {
                            int targetHandle = (isValidObjectHandle(objectHandle)) ? objectHandle : SONY_SHOT_OBJECT_HANDLE;
                            if (isSoftwareCapturing) {
                                Log.i(TAG, String.format(Locale.US, "📸 [%s] [STAGE_3:MATCH] Software capture event handle resolved: 0x%08X. Releasing photoReadyLatch...",
                                    corr, targetHandle));
                                pendingCapturedHandle.set(targetHandle);
                                if (photoReadyLatch != null) {
                                    photoReadyLatch.countDown();
                                }
                            } else {
                                // Physical shutter pressed on camera body: signaled by ObjectAdded (0xC201 / 0x4002) or CaptureComplete (0x400D)
                                handlePhysicalShutterCapture(targetHandle);
                            }
                        }
                    } else if (read < 0) {
                        if (interruptIn != null && connection != null && isEndpointHalted(connection, interruptIn)) {
                            Log.w(TAG, "[EVENT_THREAD] Interrupt endpoint 0x" + Integer.toHexString(interruptIn.getAddress()) + " halted. Clearing halt...");
                            clearEndpointHalt(connection, interruptIn);
                        }
                    }
                } catch (Throwable e) {
                    if (isInterrupted.get()) break;
                    Log.d(TAG, "Interrupt poll cycle notice: " + e.getMessage());
                }
            }
            Log.i(TAG, "[EVENT_THREAD] Terminated.");
        }, "SonyInterruptEventThread");

        eventThread.setDaemon(true);
        eventThread.start();
    }

    private synchronized void handlePhysicalShutterCapture(int eventHandle) {
        if (isCapturing || isSoftwareCapturing) {
            Log.w(TAG, "[PHYSICAL_SHUTTER] Capture or download already active. Skipping duplicate event dispatch.");
            return;
        }
        isCapturing = true;

        final long tStart = System.currentTimeMillis();
        final String physCorrId = "CORR_PHYSICAL_" + tStart;
        this.currentCorrelationId = physCorrId;

        new Thread(() -> {
            Log.i(TAG, String.format(Locale.US, "==================== [%s] [PHYSICAL_SHUTTER:START] Camera=%s ====================",
                physCorrId, cameraModel));
            updateState(STATE_CAPTURE_IN_PROGRESS, "Shutter fisik kamera ditekan. Mengunduh foto...");

            try {
                // Step 1: Pause Live View and drain USB Bulk IN pipe
                pauseLiveViewAndDrain(physCorrId);

                // Step 2: Settle period for BIONZ X processing (200ms)
                try { Thread.sleep(200); } catch (InterruptedException ignored) {}
                long tResponse = System.currentTimeMillis();

                CapturedPhotoResult photo = null;
                synchronized (usbLock) {
                    int handleToDownload = (isValidObjectHandle(eventHandle))
                        ? eventHandle
                        : SONY_SHOT_OBJECT_HANDLE;

                    long tTransferStart = System.currentTimeMillis();
                    Log.i(TAG, String.format(Locale.US, "📸 [%s] [PHYSICAL_SHUTTER:DOWNLOAD] Handle=0x%08X. Commencing download...",
                        physCorrId, handleToDownload));
                    
                    photo = downloadAndSaveObject(handleToDownload);
                    long tTransferEnd = System.currentTimeMillis();

                    photo.correlationId = physCorrId;
                    photo.triggerSource = "PHYSICAL_SHUTTER";
                    photo.tButtonToResponseMs = tResponse - tStart;
                    photo.tResponseToTransferStartMs = tTransferStart - tResponse;
                    photo.tTransferDurationMs = tTransferEnd - tTransferStart;
                    photo.tFileToUiMs = System.currentTimeMillis() - tTransferEnd;
                    photo.totalMs = System.currentTimeMillis() - tStart;
                }

                if (photo != null) {
                    Log.i(TAG, String.format(Locale.US,
                        "🎉 [%s] [PHYSICAL_SHUTTER:COMPLETE] Photo delivered to UI: %s (%dx%d), TotalTime=%dms (T1:Button->Resp=%dms, T2:Resp->Xfer=%dms, T3:Xfer=%dms, T4:File->UI=%dms)",
                        physCorrId, photo.nativeFilePath, photo.width, photo.height, photo.totalMs,
                        photo.tButtonToResponseMs, photo.tResponseToTransferStartMs, photo.tTransferDurationMs, photo.tFileToUiMs));
                    if (eventListener != null) {
                        eventListener.onPhotoCaptured(photo);
                    }
                }
            } catch (Throwable e) {
                Log.e(TAG, String.format(Locale.US, "[%s] [PHYSICAL_SHUTTER_FAILED] Gagal memproses foto dari shutter fisik: %s", physCorrId, e.getMessage()), e);
            } finally {
                isCapturing = false;
                resumeLiveView(physCorrId);
                updateState(isLiveViewRunning.get() ? STATE_LIVE_VIEW_STREAMING : STATE_CAMERA_READY,
                    "Shutter fisik selesai diproses.");
            }
        }, "SonyPhysicalShutterWorker").start();
    }

    // --- High-Performance Live View & Local HTTP Server ---

    public boolean startLiveView(int port) {
        synchronized (usbLock) {
            if (!isConnected || connection == null) {
                liveViewErrorMessage = "Kamera belum terhubung.";
                Log.e(TAG, "[LIVEVIEW_ERROR] " + liveViewErrorMessage);
                updateState(STATE_ERROR, liveViewErrorMessage);
                return false;
            }

            if (isLiveViewRunning.get() && liveViewServer != null && liveViewThread != null && liveViewThread.isAlive()) {
                Log.i(TAG, "[LIVEVIEW_RETAIN] Live View already running on port " + port + ". Preserving active stream.");
                updateState(latestJpegFrame != null ? STATE_LIVE_VIEW_STREAMING : STATE_LIVE_VIEW_STARTING,
                    latestJpegFrame != null ? "Streaming Sony Live View aktif." : "Menyiapkan live view...");
                return true;
            }

            try {
                currentPtpStage = "LIVE_VIEW_STARTING";
                updateState(STATE_LIVE_VIEW_STARTING, "Menginisialisasi Live View kamera Sony...");
                liveViewErrorMessage = "";
                firstValidFrameTimeMs = 0;
                liveViewStartTimeMs = System.currentTimeMillis();

                // Start or reuse embedded HTTP server
                if (liveViewServer == null) {
                    liveViewServer = new LiveViewHttpServer(port);
                    liveViewServer.start();
                }

                isLiveViewRunning.set(true);

                // Start dedicated frame loop thread
                liveViewThread = new Thread(this::liveViewWorkerLoop, "SonyLiveViewWorker");
                liveViewThread.setDaemon(true);
                liveViewThread.start();

                Log.i(TAG, "[LIVEVIEW_INITIALIZED] Live View streaming worker started on http://127.0.0.1:" + port + "/liveview");
                return true;
            } catch (Throwable t) {
                liveViewErrorMessage = "Gagal memulai streaming live view: " + t.getMessage();
                Log.e(TAG, "[LIVEVIEW_START_ERROR] " + liveViewErrorMessage, t);
                updateState(STATE_LIVE_VIEW_ERROR, liveViewErrorMessage);
                stopLiveView();
                return false;
            }
        }
    }

    public void stopLiveView() {
        isLiveViewRunning.set(false);
        isLiveViewPaused.set(false);
        if (liveViewThread != null && liveViewThread.isAlive()) {
            liveViewThread.interrupt();
            liveViewThread = null;
        }
        if (liveViewServer != null) {
            liveViewServer.stop();
            liveViewServer = null;
        }
        latestJpegFrame = null;
        Log.i(TAG, "[LIVEVIEW_STOPPED] Sony Live View stopped.");
    }

    private void drainBulkInPipe(int timeoutMs) {
        if (bulkIn == null || connection == null) return;
        byte[] drainBuf = new byte[4096];
        int drained = 0;
        try {
            while (true) {
                int r = connection.bulkTransfer(bulkIn, drainBuf, drainBuf.length, timeoutMs);
                if (r <= 0) break;
                drained += r;
                if (drained > 4 * 1024 * 1024) break; // 4MB safety limit
            }
        } catch (Throwable t) {
            Log.w(TAG, "[DRAIN_WARN] Notice draining Bulk IN pipe: " + t.getMessage());
        }
        if (drained > 0) {
            Log.i(TAG, String.format(Locale.US, "[LIVEVIEW_DRAIN] Drained %d residual bytes from Bulk-IN USB pipe.", drained));
        }
        incomingLength = 0;
        incoming = new byte[0];
    }

    public void pauseLiveViewAndDrain(String correlationId) {
        if (!isLiveViewRunning.get()) return;
        isLiveViewPaused.set(true);
        Log.i(TAG, String.format(Locale.US, "[%s] [LIVEVIEW_PAUSE] Pausing live view worker loop and synchronizing USB bus...", correlationId));

        synchronized (usbLock) {
            drainBulkInPipe(30);

            // Settle time for USB bus and camera command state machine (50ms parity with Desktop runner)
            try {
                Thread.sleep(50);
            } catch (InterruptedException ignored) {}
        }
    }

    public void resumeLiveView(String correlationId) {
        if (!isLiveViewRunning.get()) return;
        isLiveViewPaused.set(false);
        Log.i(TAG, String.format(Locale.US, "[%s] [LIVEVIEW_RESUME] Live view worker resumed.", correlationId));
    }

    private void liveViewWorkerLoop() {
        Log.i(TAG, "[LIVEVIEW_LOOP_START] Commencing Sony live view frame loop (Thread: " + Thread.currentThread().getName() + ")");
        long fpsStartTime = System.currentTimeMillis();
        long fpsFrames = 0;
        int consecutiveFailures = 0;
        final int MAX_CONSECUTIVE_FAILURES = 5;

        try {
            while (isLiveViewRunning.get() && isConnected && !isInterrupted.get()) {
                if (isCapturing || isLiveViewPaused.get()) {
                    Thread.sleep(40);
                    continue;
                }

                byte[] jpeg = null;

                synchronized (usbLock) {
                    if (!isConnected || !isLiveViewRunning.get() || isInterrupted.get()) break;
                    if (isLiveViewPaused.get() || isCapturing) {
                        // Pause or capture requested while acquiring lock: do not break loop, yield and sleep
                        continue;
                    }

                    try {
                        currentPtpStage = "LIVE_VIEW:GET_OBJECT";
                        sendCommand(PTP_OC_GetObject, SONY_LIVEVIEW_OBJECT_HANDLE);

                        currentPtpStage = "LIVE_VIEW:READ_DATA";
                        Container dataContainer = readObjectDataContainer();

                        currentPtpStage = "LIVE_VIEW:READ_RESPONSE";
                        int getObjectResult = readUntilResponse("LiveView GetObject");

                        if (dataContainer != null && dataContainer.raw != null) {
                            jpeg = extractJpegFromPayload(dataContainer.raw);
                        }

                        if (getObjectResult != PTP_RC_OK) {
                            Log.w(TAG, "[LIVEVIEW] GetObject returned non-OK response code: 0x" + Integer.toHexString(getObjectResult));
                        }

                        consecutiveFailures = 0;
                    } catch (IOException e) {
                        consecutiveFailures++;
                        Log.w(TAG, String.format(Locale.US, "[LIVEVIEW_FRAME_WARN] Frame fetch notice (%d): %s (Stage=%s)",
                            consecutiveFailures, e.getMessage(), currentPtpStage));
                        if (bulkIn != null && connection != null && isEndpointHalted(connection, bulkIn)) {
                            clearEndpointHalt(connection, bulkIn);
                        }
                        try {
                            Thread.sleep(60);
                        } catch (InterruptedException ie) {
                            break;
                        }
                    }
                }

                if (jpeg != null && jpeg.length > 500) {
                    // Marker Validation: SOI = FF D8, EOI = FF D9
                    boolean hasSoi = (jpeg[0] & 0xFF) == 0xFF && (jpeg[1] & 0xFF) == 0xD8;
                    boolean hasEoi = (jpeg[jpeg.length - 2] & 0xFF) == 0xFF && (jpeg[jpeg.length - 1] & 0xFF) == 0xD9;

                    if (hasSoi && hasEoi) {
                        CRC32 crc = new CRC32();
                        crc.update(jpeg);
                        long currentCrc = crc.getValue();

                        totalFramesReceived++;
                        fpsFrames++;
                        if (currentCrc != lastFrameCrc) {
                            totalFramesChanged++;
                            lastFrameCrc = currentCrc;
                        }

                        latestJpegFrame = jpeg;

                        if (firstValidFrameTimeMs == 0) {
                            firstValidFrameTimeMs = System.currentTimeMillis();
                            long elapsed = firstValidFrameTimeMs - liveViewStartTimeMs;
                            Log.i(TAG, String.format(Locale.US, "🎉 [FIRST_VALID_FRAME] First valid JPEG frame received! Size: %d bytes, SOI=FFD8, EOI=FFD9, TimeToFirstFrame=%dms, Thread=[%s]",
                                jpeg.length, elapsed, Thread.currentThread().getName()));
                        }

                        if (!STATE_LIVE_VIEW_STREAMING.equals(currentState)) {
                            updateState(STATE_LIVE_VIEW_STREAMING, "Live View streaming aktif (" + jpeg.length + " bytes/frame).");
                        }

                        long now = System.currentTimeMillis();
                        if (now - fpsStartTime >= 1000) {
                            currentFps = (fpsFrames * 1000.0) / (now - fpsStartTime);
                            fpsStartTime = now;
                            fpsFrames = 0;
                            Log.d(TAG, String.format(Locale.US, "[LIVEVIEW_METRICS] FPS: %.1f | Total: %d | Dynamic: %d | FrameLen: %d B | Thread=[%s]",
                                currentFps, totalFramesReceived, totalFramesChanged, jpeg.length, Thread.currentThread().getName()));
                        }
                    } else {
                        Log.w(TAG, "[JPEG_MARKER_WARNING] Frame missing SOI/EOI! Len=" + jpeg.length + " SOI=" + hasSoi + " EOI=" + hasEoi);
                    }
                }

                // Yield ~10ms for smooth throughput (~25-30 fps governed by camera)
                Thread.sleep(10);
            }
        } catch (InterruptedException e) {
            Log.i(TAG, "[LIVEVIEW_WORKER] Thread interrupted.");
        } catch (Throwable t) {
            Log.e(TAG, "[LIVEVIEW_WORKER_ERROR] " + t.getMessage(), t);
            liveViewErrorMessage = "Koneksi streaming Live View terganggu: " + t.getMessage();
            isLiveViewRunning.set(false);
            updateState(STATE_LIVE_VIEW_ERROR, liveViewErrorMessage);
        } finally {
            Log.i(TAG, "[LIVEVIEW_LOOP_EXIT] Live View worker loop terminated.");
        }
    }

    public static byte[] extractJpegFromPayload(byte[] rawContainer) {
        if (rawContainer == null || rawContainer.length < 24) return null;

        // Check if rawContainer is already pure JPEG (starts with SOI at offset 0)
        int soi = -1;
        if ((rawContainer[0] & 0xFF) == 0xFF && (rawContainer[1] & 0xFF) == 0xD8) {
            soi = 0;
        } else {
            // Skip 12-byte PTP header, find SOI (0xFF, 0xD8)
            for (int i = 12; i < rawContainer.length - 1; i++) {
                if ((rawContainer[i] & 0xFF) == 0xFF && (rawContainer[i + 1] & 0xFF) == 0xD8) {
                    soi = i;
                    break;
                }
            }
        }

        int eoi = -1;
        if (soi != -1) {
            for (int i = rawContainer.length - 1; i > soi + 2; i--) {
                if ((rawContainer[i - 1] & 0xFF) == 0xFF && (rawContainer[i] & 0xFF) == 0xD9) {
                    eoi = i + 1;
                    break;
                }
            }
        }

        if (soi != -1 && eoi != -1 && eoi > soi) {
            return Arrays.copyOfRange(rawContainer, soi, eoi);
        }
        return null;
    }

    // --- Shutter Capture (Full-Res Photo Trigger & Retrieval) ---

    public int setControlDeviceB(int propCode, int value) throws IOException {
        String propName = String.format(Locale.US, "0x%04X", propCode);
        if (propCode == SONY_DPC_S1_BUTTON) propName = "S1_BUTTON(0xD2C1)";
        else if (propCode == SONY_DPC_S2_BUTTON) propName = "S2_BUTTON(0xD2C2)";
        else if (propCode == SONY_DPC_S1_AND_S2_BUTTON) propName = "S1_AND_S2(0xD2E6)";
        else if (propCode == SONY_DPC_REQUEST_ONE_SHOOTING) propName = "REQUEST_ONE_SHOOTING(0xD2C7)";
        else if (propCode == SONY_DPC_SHOOTING_FILE_INFO) propName = "SHOOTING_FILE_INFO(0xD215)";
        else if (propCode == SONY_DPC_STILL_IMAGE_STORE_DESTINATION) propName = "STILL_IMAGE_STORE_DEST(0xD222)";
        else if (propCode == SONY_DPC_STILL_IMAGE_TRANS_SIZE) propName = "STILL_IMAGE_TRANS_SIZE(0xD223)";
        else if (propCode == SONY_DPC_PRIORITY_KEY) propName = "PRIORITY_KEY(0xD229)";

        String valName = (value == SONY_BUTTON_PRESS ? "PRESS(0x0002)" : (value == SONY_BUTTON_RELEASE ? "RELEASE(0x0001)" : String.format(Locale.US, "0x%04X", value)));
        String corr = currentCorrelationId != null ? currentCorrelationId : "INIT";
        Log.i(TAG, String.format(Locale.US, "[%s] [SONY_CONTROL_SEND] SetControlDeviceB -> %s, Value=%s, TxID=%d",
            corr, propName, valName, transactionId));

        // 1. Command Phase: 0x9207 with 1 param (propCode)
        sendCommand(PTP_OC_SONY_SetControlDeviceB, propCode);

        // 2. Data Phase: 2-byte little-endian uint16 payload
        ByteBuffer bb = ByteBuffer.allocate(2).order(ByteOrder.LITTLE_ENDIAN);
        bb.putShort((short) value);
        sendData(PTP_OC_SONY_SetControlDeviceB, bb.array());

        // 3. Response Phase: wait for 0x2001 OK
        int res = readUntilResponse("SetControlDeviceB(" + propName + ")");
        if (res != PTP_RC_OK) {
            Log.w(TAG, String.format(Locale.US, "⚠️ [%s] [SONY_CONTROL_WARN] SetControlDeviceB(%s) returned response: 0x%04X (%s)",
                corr, propName, res, getOpCodeName(res)));
        } else {
            Log.d(TAG, String.format(Locale.US, "✅ [%s] [SONY_CONTROL_OK] SetControlDeviceB(%s) returned 0x2001 OK", corr, propName));
        }
        return res;
    }

    public static class ObjectMetadata {
        public final int handle;
        public final int storageId;
        public final int format;
        public final long compressedSize;
        public final int imageWidth;
        public final int imageHeight;

        public ObjectMetadata(int handle, int storageId, int format, long compressedSize, int imageWidth, int imageHeight) {
            this.handle = handle;
            this.storageId = storageId;
            this.format = format;
            this.compressedSize = compressedSize;
            this.imageWidth = imageWidth;
            this.imageHeight = imageHeight;
        }
    }

    private final java.util.concurrent.ConcurrentHashMap<String, Long> processedPhotos = new java.util.concurrent.ConcurrentHashMap<>();
    private static final long DEDUP_TTL_MS = 10000;

    private boolean isDuplicateCapture(String key) {
        long now = System.currentTimeMillis();
        for (Map.Entry<String, Long> entry : processedPhotos.entrySet()) {
            if (now - entry.getValue() > DEDUP_TTL_MS) {
                processedPhotos.remove(entry.getKey());
            }
        }
        if (processedPhotos.containsKey(key)) {
            return true;
        }
        processedPhotos.put(key, now);
        return false;
    }

    public CapturedPhotoResult capturePhoto() throws Exception {
        return capturePhoto("CORR_" + System.currentTimeMillis() + "_" + Integer.toHexString((int)(Math.random() * 0xFFFF)));
    }

    public CapturedPhotoResult capturePhoto(String correlationId) throws Exception {
        if (!isConnected || connection == null) {
            throw new IllegalStateException("Kamera Sony belum terhubung melalui USB.");
        }

        final long tStart = System.currentTimeMillis();
        long tResponse = 0;
        long tTransferStart = 0;
        long tTransferEnd = 0;

        this.currentCorrelationId = correlationId;

        // Set isCapturing & isSoftwareCapturing BEFORE acquiring usbLock so liveViewWorkerLoop yields immediately!
        isCapturing = true;
        isSoftwareCapturing = true;
        photoReadyLatch = new java.util.concurrent.CountDownLatch(1);
        focusLockLatch = new java.util.concurrent.CountDownLatch(1);
        pendingCapturedHandle.set(null);

        Log.i(TAG, String.format(Locale.US, "==================== [%s] [APP_SHUTTER:START] Camera=%s, VID=0x%04X, PID=0x%04X, Iface=%d ====================",
            correlationId, cameraModel, (usbDevice != null ? usbDevice.getVendorId() : 0),
            (usbDevice != null ? usbDevice.getProductId() : 0),
            (usbInterface != null ? usbInterface.getId() : -1)));
        updateState(STATE_CAPTURE_IN_PROGRESS, "Memicu shutter kamera Sony (" + cameraModel + ")...");

        // Pause Live View and drain USB bulk IN pipe before touching PTP shutter
        pauseLiveViewAndDrain(correlationId);

        boolean s1Pressed = false;
        boolean s2Pressed = false;

        try {
            synchronized (usbLock) {
                if (!isConnected || connection == null || !isSessionOpen) {
                    throw new IllegalStateException("Kamera Sony tidak terhubung atau sesi PTP tidak aktif.");
                }

                currentPtpStage = "CAPTURE:SHUTTER_ACTUATION";
                Log.i(TAG, String.format(Locale.US, "[%s] [APP_SHUTTER:ACTUATION] Desktop-parity sequence (S1 Lock -> AF wait -> S2 Trip -> S1 Hold -> S1 Release)...", correlationId));

                // Step 1: S1 Half-press (Autofocus & Metering Lock)
                currentPtpStage = "CAPTURE:S1_PRESS";
                long s1Start = System.currentTimeMillis();
                int s1PressRes = setControlDeviceB(SONY_DPC_S1_BUTTON, SONY_BUTTON_PRESS);
                if (s1PressRes == PTP_RC_OK) {
                    s1Pressed = true;
                }
                Log.i(TAG, String.format(Locale.US, "📸 [%s] [APP_SHUTTER:S1_PRESS] SetControlDeviceB(S1_PRESS) Response=0x%04X (%s, TxID=%d, Elapsed=%dms)",
                    correlationId, s1PressRes, getOpCodeName(s1PressRes), currentTxId, System.currentTimeMillis() - s1Start));
                
                // Wait for AF focus lock indication if camera reports it (up to 1000ms), or settle 250ms
                boolean focusLocked = false;
                if (focusLockLatch != null) {
                    try {
                        focusLocked = focusLockLatch.await(1000, TimeUnit.MILLISECONDS);
                    } catch (InterruptedException ignored) {}
                }
                if (focusLocked) {
                    Log.i(TAG, String.format(Locale.US, "🎯 [%s] [APP_SHUTTER:FOCUS_LOCKED] Focus confirmed via camera interrupt event 0xD213.", correlationId));
                } else {
                    Log.i(TAG, String.format(Locale.US, "⏱️ [%s] [APP_SHUTTER:FOCUS_SETTLE] S1 settle time elapsed (250ms). Proceeding to shutter trip.", correlationId));
                    try { Thread.sleep(250); } catch (InterruptedException ignored) {}
                }

                // Step 2: S2 Full-press (Shutter Trip)
                currentPtpStage = "CAPTURE:S2_PRESS";
                long s2Start = System.currentTimeMillis();
                int s2PressRes = setControlDeviceB(SONY_DPC_S2_BUTTON, SONY_BUTTON_PRESS);
                if (s2PressRes == PTP_RC_OK) {
                    s2Pressed = true;
                }
                Log.i(TAG, String.format(Locale.US, "📸 [%s] [APP_SHUTTER:S2_PRESS] SetControlDeviceB(S2_PRESS) Response=0x%04X (%s, TxID=%d, Elapsed=%dms)",
                    correlationId, s2PressRes, getOpCodeName(s2PressRes), currentTxId, System.currentTimeMillis() - s2Start));

                // If camera returned Device_Busy (0x2019) or parameter error, attempt one retry after 100ms
                if (s2PressRes != PTP_RC_OK) {
                    try { Thread.sleep(100); } catch (InterruptedException ignored) {}
                    s2PressRes = setControlDeviceB(SONY_DPC_S2_BUTTON, SONY_BUTTON_PRESS);
                    if (s2PressRes == PTP_RC_OK) {
                        s2Pressed = true;
                    }
                    Log.i(TAG, String.format(Locale.US, "📸 [%s] [APP_SHUTTER:S2_RETRY] SetControlDeviceB(S2_PRESS) retry Response=0x%04X (%s)",
                        correlationId, s2PressRes, getOpCodeName(s2PressRes)));
                }

                boolean s2Accepted = (s2PressRes == PTP_RC_OK);

                // Step 3: S2 Full-press Release (50ms parity with Desktop runner line 338-341)
                try { Thread.sleep(50); } catch (InterruptedException ignored) {}
                currentPtpStage = "CAPTURE:S2_RELEASE";
                setControlDeviceB(SONY_DPC_S2_BUTTON, SONY_BUTTON_RELEASE);
                s2Pressed = false;
                tResponse = System.currentTimeMillis();

                // Step 4: S1 Hold during exposure (800ms parity with Desktop runner line 345)
                currentPtpStage = "CAPTURE:S1_HOLD_EXPOSURE";
                Log.i(TAG, String.format(Locale.US, "📸 [%s] [APP_SHUTTER:S1_HOLD] Holding S1 lock during sensor exposure & BIONZ X processing...", correlationId));
                try { Thread.sleep(800); } catch (InterruptedException ignored) {}

                // Step 5: S1 Half-press Release
                currentPtpStage = "CAPTURE:S1_RELEASE";
                setControlDeviceB(SONY_DPC_S1_BUTTON, SONY_BUTTON_RELEASE);
                s1Pressed = false;

                if (!s2Accepted) {
                    String rejectMsg = String.format(Locale.US,
                        "Kamera Sony menolak shutter (Response=0x%04X %s). Kemungkinan kamera belum mengunci fokus (AF) atau lensa terhalang. Arahkan kamera ke subjek atau gunakan mode MF.",
                        s2PressRes, getOpCodeName(s2PressRes));
                    setStageFailed("CAPTURE:SHUTTER_REJECTED", rejectMsg);
                    throw new IOException(rejectMsg);
                }

                Log.i(TAG, String.format(Locale.US,
                    "📸 [%s] [CAPTURE_COMMAND_SUCCESS] S1/S2 shutter sequence completed (S1Press=0x%04X, S2Press=0x%04X, S2Rel=0x0001, S1Rel=0x0001, S1Hold=800ms, TotalActuation=%dms)",
                    correlationId, s1PressRes, s2PressRes, (tResponse - tStart)));
            }

            // Step 6: Wait for photo ready signal from interrupt thread (up to 3000ms).
            Integer eventHandle = null;
            long latchStart = System.currentTimeMillis();
            try {
                if (photoReadyLatch.await(3000, TimeUnit.MILLISECONDS)) {
                    eventHandle = pendingCapturedHandle.get();
                    Log.i(TAG, String.format(Locale.US,
                        "⚡ [%s] [CAMERA_EVENT_CONFIRMATION] Photo ready event signaled in %dms (Handle=0x%08X)",
                        correlationId, (System.currentTimeMillis() - latchStart), (eventHandle != null ? eventHandle : 0)));
                } else {
                    Log.i(TAG, String.format(Locale.US,
                        "⏱️ [%s] [APP_SHUTTER:EVENT_TIMEOUT] Photo latch elapsed in %dms. Proceeding to metadata verification for 0xFFFFC001.",
                        correlationId, (System.currentTimeMillis() - latchStart)));
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }

            // Step 7: Acquire usbLock and download photo directly from resolved handle
            synchronized (usbLock) {
                int handleToDownload = (eventHandle != null && isValidObjectHandle(eventHandle))
                    ? eventHandle
                    : SONY_SHOT_OBJECT_HANDLE;

                tTransferStart = System.currentTimeMillis();
                Log.i(TAG, String.format(Locale.US, "📸 [%s] [APP_SHUTTER:DOWNLOAD_START] Commencing download sequence for handle 0x%08X...", correlationId, handleToDownload));
                
                CapturedPhotoResult result = downloadAndSaveObject(handleToDownload);
                tTransferEnd = System.currentTimeMillis();

                result.correlationId = correlationId;
                result.triggerSource = "APP_SHUTTER";
                result.tButtonToResponseMs = tResponse - tStart;
                result.tResponseToTransferStartMs = tTransferStart - tResponse;
                result.tTransferDurationMs = tTransferEnd - tTransferStart;
                result.tFileToUiMs = System.currentTimeMillis() - tTransferEnd;
                result.totalMs = System.currentTimeMillis() - tStart;

                setStageSuccess("CAPTURE:PHOTO_DOWNLOADED");
                Log.i(TAG, String.format(Locale.US,
                    "🎉 [%s] [APP_SHUTTER:COMPLETE] Photo captured & saved: %s (%dx%d), TotalTime=%dms (T1:Button->Resp=%dms, T2:Resp->Xfer=%dms, T3:Xfer=%dms, T4:File->UI=%dms)",
                    correlationId, result.nativeFilePath, result.width, result.height, result.totalMs,
                    result.tButtonToResponseMs, result.tResponseToTransferStartMs, result.tTransferDurationMs, result.tFileToUiMs));

                return result;
            }
        } finally {
            // Guaranteed key release cleanup on every exit path, strictly within usbLock
            if (s2Pressed || s1Pressed) {
                synchronized (usbLock) {
                    try {
                        if (s2Pressed) setControlDeviceB(SONY_DPC_S2_BUTTON, SONY_BUTTON_RELEASE);
                    } catch (Throwable ignored) {}
                    try {
                        if (s1Pressed) setControlDeviceB(SONY_DPC_S1_BUTTON, SONY_BUTTON_RELEASE);
                    } catch (Throwable ignored) {}
                }
            }

            focusLockLatch = null;
            photoReadyLatch = null;
            try { Thread.sleep(200); } catch (InterruptedException ignored) {} // Match desktop sleep_for(200ms) before live view resumes
            isSoftwareCapturing = false;
            isCapturing = false;
            resumeLiveView(correlationId);
            updateState(isLiveViewRunning.get() ? STATE_LIVE_VIEW_STREAMING : STATE_CAMERA_READY, 
                "Pengambilan foto selesai.");
        }
    }

    int waitForNewObjectHandle(int initialHandle, int timeoutMs) {
        long start = System.currentTimeMillis();
        Log.i(TAG, String.format(Locale.US, "[%s] [WAIT_HANDLE] Polling for new object handle (initial=0x%08X, timeout=%dms)...",
            currentCorrelationId, initialHandle, timeoutMs));

        while (System.currentTimeMillis() - start < timeoutMs) {
            try {
                Thread.sleep(300);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return -1;
            }

            int currentHandle = getLatestObjectHandle();
            if (isValidObjectHandle(currentHandle) && (!isValidObjectHandle(initialHandle) || currentHandle != initialHandle)) {
                Log.i(TAG, String.format(Locale.US, "📸 [%s] [WAIT_HANDLE] New object handle detected: 0x%08X (initial was 0x%08X, elapsed=%dms)",
                    currentCorrelationId, currentHandle, initialHandle, System.currentTimeMillis() - start));
                return currentHandle;
            }
        }

        int finalHandle = getLatestObjectHandle();
        Log.i(TAG, String.format(Locale.US, "[%s] [WAIT_HANDLE] Polling timeout reached. Latest handle is 0x%08X", currentCorrelationId, finalHandle));
        return finalHandle;
    }

    int getLatestObjectHandle() {
        try {
            sendCommand(PTP_OC_GetObjectHandles, 0xFFFFFFFF, 0, 0);
            Container container = readObjectDataContainer();
            if (container != null && container.type != PTP_TYPE_RESPONSE) {
                readUntilResponse("GetObjectHandles");
            }

            if (container != null && container.type == PTP_TYPE_RESPONSE) {
                Log.w(TAG, String.format(Locale.US, "[GET_OBJECT_HANDLES] Camera returned direct response 0x%04X (%s), storage handles not queryable via PTP 0x1007",
                    container.code, getOpCodeName(container.code)));
                return -1;
            }

            if (container != null && container.raw != null && container.raw.length >= 16) {
                ByteBuffer bb = ByteBuffer.wrap(container.raw, 12, container.raw.length - 12).order(ByteOrder.LITTLE_ENDIAN);
                int count = bb.getInt();
                int lastHandle = 0;
                for (int i = 0; i < count && bb.remaining() >= 4; i++) {
                    lastHandle = bb.getInt();
                }
                Log.i(TAG, String.format(Locale.US, "[GET_OBJECT_HANDLES] Found %d handles, latest=0x%08X", count, lastHandle));
                return lastHandle;
            }
        } catch (Throwable e) {
            Log.w(TAG, "GetObjectHandles notice: " + e.getMessage());
        }
        return -1;
    }

    public ObjectMetadata getObjectInfo(int objectHandle) throws IOException {
        String parentStage = currentPtpStage;
        currentPtpStage = "DOWNLOAD_PHOTO:GET_OBJECT_INFO";
        Log.i(TAG, String.format(Locale.US, "[PHOTO_DOWNLOAD:GET_OBJECT_INFO_SEND] Requesting ObjectInfo for 0x%08X (OpCode=0x%04X, TxID=%d)...",
            objectHandle, PTP_OC_GetObjectInfo, transactionId));
        sendCommand(PTP_OC_GetObjectInfo, objectHandle);

        Container dataContainer = readObjectDataContainer(-1);
        if (dataContainer == null) {
            currentPtpStage = parentStage;
            return null;
        }

        int responseCode;
        if (dataContainer.type == PTP_TYPE_RESPONSE) {
            responseCode = dataContainer.code;
            Log.w(TAG, String.format(Locale.US, "[OBJECT_INFO_RESP] GetObjectInfo(0x%08X) returned direct response: 0x%04X (%s)",
                objectHandle, responseCode, getOpCodeName(responseCode)));
            currentPtpStage = parentStage;
            if (responseCode == PTP_RC_InvalidObjectHandle) {
                throw new UnsupportedOperationException("PTP_RC_InvalidObjectHandle");
            }
            return null;
        } else {
            responseCode = readUntilResponse("GetObjectInfo 0x" + Integer.toHexString(objectHandle));
        }

        currentPtpStage = parentStage;

        if (responseCode != PTP_RC_OK || dataContainer.raw == null || dataContainer.raw.length < 24) {
            Log.w(TAG, String.format(Locale.US, "[OBJECT_INFO_WARN] GetObjectInfo(0x%08X) returned Response=0x%04X, DataLen=%d",
                objectHandle, responseCode, dataContainer.raw != null ? dataContainer.raw.length : 0));
            return null;
        }

        ByteBuffer bb = ByteBuffer.wrap(dataContainer.raw, 12, dataContainer.raw.length - 12).order(ByteOrder.LITTLE_ENDIAN);
        int storageId = bb.getInt();
        int format = bb.getShort() & 0xFFFF;
        int protection = bb.getShort() & 0xFFFF;
        long compressedSize = bb.getInt() & 0xFFFFFFFFL;

        int thumbFormat = bb.remaining() >= 2 ? (bb.getShort() & 0xFFFF) : 0;
        long thumbSize = bb.remaining() >= 4 ? (bb.getInt() & 0xFFFFFFFFL) : 0;
        int thumbW = bb.remaining() >= 4 ? bb.getInt() : 0;
        int thumbH = bb.remaining() >= 4 ? bb.getInt() : 0;
        int imgW = bb.remaining() >= 4 ? bb.getInt() : 0;
        int imgH = bb.remaining() >= 4 ? bb.getInt() : 0;

        Log.i(TAG, String.format(Locale.US, "📋 [PHOTO_DOWNLOAD:GET_OBJECT_INFO_RECV] Handle=0x%08X, Format=0x%04X, Size=%d bytes, Dims=%dx%d, Response=0x%04X (TxID=%d)",
            objectHandle, format, compressedSize, imgW, imgH, responseCode, currentTxId));
        return new ObjectMetadata(objectHandle, storageId, format, compressedSize, imgW, imgH);
    }

    public ObjectMetadata waitForPhotoReadyAndMetadata(int targetHandle, long maxWaitMs, String correlationId) {
        long start = System.currentTimeMillis();
        ObjectMetadata meta = null;
        int pollCount = 0;
        Log.i(TAG, String.format(Locale.US, "⏳ [%s] [PHOTO_READY_WAIT:START] Polling GetObjectInfo for handle 0x%08X (Timeout=%dms)...",
            correlationId, targetHandle, maxWaitMs));

        while (System.currentTimeMillis() - start < maxWaitMs && !isInterrupted.get() && isConnected) {
            pollCount++;
            try {
                meta = getObjectInfo(targetHandle);
                if (meta != null && meta.compressedSize > 10000) {
                    long elapsed = System.currentTimeMillis() - start;
                    Log.i(TAG, String.format(Locale.US,
                        "✅ [%s] [PHOTO_READY_WAIT:SUCCESS] Handle 0x%08X confirmed ready in %dms (Poll #%d): Size=%d bytes, Dims=%dx%d, Format=0x%04X",
                        correlationId, targetHandle, elapsed, pollCount, meta.compressedSize, meta.imageWidth, meta.imageHeight, meta.format));
                    return meta;
                }
            } catch (UnsupportedOperationException uoe) {
                Log.i(TAG, String.format(Locale.US,
                    "ℹ️ [%s] [PHOTO_READY_WAIT] Handle 0x%08X does not support GetObjectInfo (PTP_RC_InvalidObjectHandle). Proceeding directly to streaming read.",
                    correlationId, targetHandle));
                break;
            } catch (Throwable t) {
                Log.d(TAG, String.format(Locale.US, "[%s] [PHOTO_READY_WAIT:POLL_NOTICE] Poll #%d notice: %s",
                    correlationId, pollCount, t.getMessage()));
            }

            try {
                Thread.sleep(150);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                break;
            }
        }

        long totalElapsed = System.currentTimeMillis() - start;
        if (meta != null && meta.compressedSize > 0) {
            Log.i(TAG, String.format(Locale.US, "ℹ️ [%s] [PHOTO_READY_WAIT:PARTIAL] Metadata available with size=%d bytes (elapsed=%dms)",
                correlationId, meta.compressedSize, totalElapsed));
            return meta;
        }

        Log.w(TAG, String.format(Locale.US, "⚠️ [%s] [PHOTO_READY_WAIT:TIMEOUT] Handle 0x%08X metadata polling timed out after %dms (%d polls). Proceeding with fallback.",
            correlationId, targetHandle, totalElapsed, pollCount));
        return null;
    }

    CapturedPhotoResult downloadAndSaveObject(int objectHandle) throws Exception {
        byte[] rawPayload;
        int resolvedHandle = objectHandle;
        long expectedSize = -1;
        int imgW = 0;
        int imgH = 0;

        if (!isValidObjectHandle(resolvedHandle)) {
            String err = String.format(Locale.US, "[%s] Handle objek tidak valid: 0x%08X", currentCorrelationId, resolvedHandle);
            setStageFailed("DOWNLOAD_PHOTO:RESOLVE_HANDLE", err);
            throw new IOException(err);
        }

        synchronized (usbLock) {
            currentPtpStage = "DOWNLOAD_PHOTO:WAIT_READY";
            ObjectMetadata meta = waitForPhotoReadyAndMetadata(resolvedHandle, 6000, currentCorrelationId);

            if (meta != null && meta.compressedSize > 0) {
                expectedSize = meta.compressedSize;
                imgW = meta.imageWidth;
                imgH = meta.imageHeight;
                Log.i(TAG, String.format(Locale.US, "🔍 [%s] [IMAGE_OBJECT_DISCOVERY] Object discovered: Handle=0x%08X, Size=%d bytes, Dims=%dx%d, Format=0x%04X",
                    currentCorrelationId, resolvedHandle, expectedSize, imgW, imgH, meta.format));
            } else {
                Log.i(TAG, String.format(Locale.US, "ℹ️ [%s] [PHOTO_DOWNLOAD:STREAMING_FALLBACK] Handle 0x%08X: No fixed size from GetObjectInfo. Using unbounded streaming read.",
                    currentCorrelationId, resolvedHandle));
            }

            currentPtpStage = "DOWNLOAD_PHOTO:GET_OBJECT";
            Log.i(TAG, String.format(Locale.US, "📸 [%s] [PHOTO_DOWNLOAD:GET_OBJECT_SEND] Sending GetObject for handle 0x%08X (OpCode=0x%04X, TxID=%d, ExpectedSize=%d)...",
                currentCorrelationId, resolvedHandle, PTP_OC_GetObject, currentTxId, expectedSize));
            sendCommand(PTP_OC_GetObject, resolvedHandle);

            currentPtpStage = "DOWNLOAD_PHOTO:READ_DATA";
            Container container = readObjectDataContainer(expectedSize);

            if (container != null && container.type == PTP_TYPE_RESPONSE) {
                String errMsg = String.format(Locale.US, "Camera returned PTP response 0x%04X instead of photo data for handle 0x%08X (TxID=%d)",
                    container.code, resolvedHandle, container.transaction);
                setStageFailed(currentPtpStage, errMsg);
                throw new IOException(errMsg);
            }

            currentPtpStage = "DOWNLOAD_PHOTO:READ_RESPONSE";
            int responseCode = readUntilResponse("GetObject 0x" + Integer.toHexString(resolvedHandle));
            Log.i(TAG, String.format(Locale.US, "📸 [%s] [PHOTO_DOWNLOAD:READ_RESPONSE] GetObject response code: 0x%04X (TxID=%d)",
                currentCorrelationId, responseCode, currentTxId));
            if (responseCode != PTP_RC_OK) {
                Log.w(TAG, String.format(Locale.US, "⚠️ [%s] [PHOTO_DOWNLOAD_WARN] GetObject response code: 0x%04X", currentCorrelationId, responseCode));
            }

            if ((container == null || container.raw == null || container.raw.length < 1000) && responseCode == PTP_RC_OK) {
                int firstLen = (container != null && container.raw != null) ? container.raw.length : 0;
                Log.w(TAG, String.format(Locale.US,
                    "⚠️ [%s] [PHOTO_DOWNLOAD:RETRY_WAIT] Container returned only %dB (camera SDRAM buffer filling). Pausing 400ms before retry...",
                    currentCorrelationId, firstLen));
                try { Thread.sleep(400); } catch (InterruptedException ignored) {}

                currentPtpStage = "DOWNLOAD_PHOTO:GET_OBJECT_RETRY";
                sendCommand(PTP_OC_GetObject, resolvedHandle);
                container = readObjectDataContainer(expectedSize);
                responseCode = readUntilResponse("GetObject retry 0x" + Integer.toHexString(resolvedHandle));
            }

            if (container == null || container.raw == null || container.raw.length < 1000) {
                int receivedLen = (container != null && container.raw != null) ? container.raw.length : 0;
                String diag;
                if (receivedLen == 12) {
                    diag = String.format(Locale.US,
                        "Gagal mengunduh payload foto dari kamera Sony: kamera mengembalikan container data kosong (Handle=0x%08X, Expected=%d, Received=12B, ResponseCode=0x%04X). Buffer SDRAM belum terisi.",
                        resolvedHandle, expectedSize, responseCode);
                } else {
                    diag = String.format(Locale.US,
                        "Gagal mengunduh payload foto dari kamera Sony: panjang payload tidak mencukupi (Handle=0x%08X, Expected=%d, Received=%dB, ResponseCode=0x%04X)",
                        resolvedHandle, expectedSize, receivedLen, responseCode);
                }
                setStageFailed(currentPtpStage, diag);
                throw new IOException(diag);
            }

            rawPayload = container.raw;

            // Detailed payload inspection
            int payloadLen = rawPayload.length;
            String magicHex = "";
            if (payloadLen >= 16) {
                magicHex = String.format(Locale.US, "%02X %02X %02X %02X",
                    rawPayload[12] & 0xFF, rawPayload[13] & 0xFF, rawPayload[14] & 0xFF, rawPayload[15] & 0xFF);
            }
            int soiIdx = -1;
            int eoiIdx = -1;
            for (int i = 12; i < payloadLen - 1; i++) {
                if ((rawPayload[i] & 0xFF) == 0xFF && (rawPayload[i + 1] & 0xFF) == 0xD8) {
                    soiIdx = i;
                    break;
                }
            }
            for (int i = payloadLen - 1; i > 13; i--) {
                if ((rawPayload[i - 1] & 0xFF) == 0xFF && (rawPayload[i] & 0xFF) == 0xD9) {
                    eoiIdx = i;
                    break;
                }
            }
            Log.i(TAG, String.format(Locale.US,
                "📸 [%s] [PHOTO_DOWNLOAD:PAYLOAD_INSPECT] Handle=0x%08X, RawLen=%d, Magic=[%s], SOI=%d, EOI=%d, ResponseCode=0x%04X, TxID=%d",
                currentCorrelationId, resolvedHandle, payloadLen, magicHex, soiIdx, eoiIdx, responseCode, currentTxId));
        }

        byte[] jpegBytes = extractJpegFromPayload(rawPayload);
        if (jpegBytes == null || jpegBytes.length < 10000) {
            int len = jpegBytes != null ? jpegBytes.length : 0;
            throw new IOException(String.format(Locale.US,
                "Validasi JPEG gagal: ukuran foto terlalu kecil atau header tidak valid (%d bytes)", len));
        }

        boolean validSoi = (jpegBytes[0] & 0xFF) == 0xFF && (jpegBytes[1] & 0xFF) == 0xD8;
        boolean validEoi = (jpegBytes[jpegBytes.length - 2] & 0xFF) == 0xFF && (jpegBytes[jpegBytes.length - 1] & 0xFF) == 0xD9;
        if (!validSoi) {
            throw new IOException("Validasi JPEG gagal: Magic bytes SOI (0xFFD8) tidak ditemukan.");
        }
        if (!validEoi) {
            throw new IOException("Validasi JPEG gagal: Magic bytes EOI (0xFFD9) tidak ditemukan.");
        }

        File picturesDir = context.getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        if (picturesDir == null) picturesDir = context.getFilesDir();
        if (!picturesDir.exists()) picturesDir.mkdirs();

        String photoId = "SONY_" + System.currentTimeMillis();
        File photoFile = new File(picturesDir, photoId + ".jpg");

        try (FileOutputStream fos = new FileOutputStream(photoFile)) {
            fos.write(jpegBytes);
            fos.flush();
        }

        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(photoFile.getAbsolutePath(), opts);
        if (opts.outWidth <= 0 || opts.outHeight <= 0) {
            photoFile.delete();
            throw new IOException(String.format(Locale.US,
                "Validasi decoding gagal: file tersimpan bukan citra JPEG yang dapat didekode (%dx%d, MIME=%s)",
                opts.outWidth, opts.outHeight, opts.outMimeType));
        }
        imgW = opts.outWidth;
        imgH = opts.outHeight;

        Log.i(TAG, String.format(Locale.US,
            "🔬 [%s] [IMAGE_DECODING_VALIDATION] JPEG signature verified (SOI=FFD8, EOI=FFD9, PayloadLen=%d bytes). Decoded image dimensions: %dx%d (MIME=%s)",
            currentCorrelationId, jpegBytes.length, imgW, imgH, opts.outMimeType));

        String dedupKey = "SIZE_" + photoFile.length() + "_HANDLE_" + resolvedHandle;
        if (isDuplicateCapture(dedupKey)) {
            Log.w(TAG, "[DEDUP] Duplicate photo capture suppressed: " + dedupKey);
        }

        BitmapFactory.Options thumbOpts = new BitmapFactory.Options();
        thumbOpts.inJustDecodeBounds = false;
        thumbOpts.inSampleSize = Math.max(1, imgW / 800);
        Bitmap thumb = BitmapFactory.decodeFile(photoFile.getAbsolutePath(), thumbOpts);
        ByteArrayOutputStream thumbStream = new ByteArrayOutputStream();
        if (thumb != null) {
            thumb.compress(Bitmap.CompressFormat.JPEG, 85, thumbStream);
            thumb.recycle();
        }

        String dataUrl = "data:image/jpeg;base64," + Base64.encodeToString(thumbStream.toByteArray(), Base64.NO_WRAP);

        CapturedPhotoResult result = new CapturedPhotoResult(
            photoId,
            photoFile.getAbsolutePath(),
            dataUrl,
            imgW,
            imgH,
            "jpeg",
            currentCorrelationId
        );

        Log.i(TAG, String.format(Locale.US,
            "💾 [%s] [FILE_SAVED_AND_UI_DELIVERED] Saved: %s (%d bytes). Delivering CapturedPhotoResult to UI",
            currentCorrelationId, photoFile.getAbsolutePath(), photoFile.length()));

        return result;
    }

    private synchronized void sendData(int code, byte[] payload) throws IOException {
        int length = 12 + (payload != null ? payload.length : 0);
        ByteBuffer packet = ByteBuffer.allocate(length).order(ByteOrder.LITTLE_ENDIAN);
        packet.putInt(length);
        packet.putShort((short) PTP_TYPE_DATA);
        packet.putShort((short) code);
        packet.putInt(this.currentTxId);
        if (payload != null && payload.length > 0) {
            packet.put(payload);
        }

        byte[] bytes = packet.array();
        int offset = 0;
        int remaining = length;
        int retries = 0;
        final int maxRetries = 3;

        Log.d(TAG, String.format(Locale.US, "[PTP_DATA_OUT] OpCode=0x%04X TxID=%d Len=%d to BulkOUT=0x%02X",
            code, this.currentTxId, length, bulkOut != null ? bulkOut.getAddress() : 0));

        while (remaining > 0) {
            if (bulkOut == null || connection == null) {
                String errMsg = "Koneksi USB atau endpoint Bulk OUT bernilai null sebelum data phase dikirim.";
                setStageFailed(currentPtpStage, errMsg);
                throw new IOException(errMsg);
            }

            long startMs = System.currentTimeMillis();
            int written = connection.bulkTransfer(bulkOut, bytes, offset, remaining, USB_TRANSFER_TIMEOUT_MS);
            long elapsedMs = System.currentTimeMillis() - startMs;

            if (written > 0) {
                offset += written;
                remaining -= written;
                retries = 0;
            } else {
                retries++;
                boolean isStalled = isEndpointHalted(connection, bulkOut);
                if (isStalled) {
                    clearEndpointHalt(connection, bulkOut);
                }
                Log.w(TAG, String.format(Locale.US,
                    "[PTP_DATA_OUT_RETRY] Data write failed for OpCode=0x%04X, TxID=%d (Written=%d/%d, Retry=%d/%d, IsStalled=%b)",
                    code, this.currentTxId, offset, length, retries, maxRetries, isStalled));
                if (retries >= maxRetries) {
                    String err = "Gagal mengirim data container PTP pada endpoint Bulk OUT.";
                    setStageFailed(currentPtpStage, err);
                    throw new IOException(err);
                }
                try {
                    Thread.sleep(50 * retries);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IOException("Interrupted while retrying PTP data out", e);
                }
            }
        }
    }

    // --- Low-Level PTP USB Transport (64 KB Chunk-Aligned Stream Parser) ---

    private synchronized void sendCommand(int code, int... params) throws IOException {
        this.currentOpCode = code;
        int length = 12 + params.length * 4;
        ByteBuffer packet = ByteBuffer.allocate(length).order(ByteOrder.LITTLE_ENDIAN);
        packet.putInt(length);
        packet.putShort((short) PTP_TYPE_COMMAND);
        packet.putShort((short) code);

        // OpenSession must always use TxID = 0 per standard PTP (ISO 15740 Clause 9.3.1)
        int currentTx;
        if (code == PTP_OC_OpenSession) {
            currentTx = 0;
            this.transactionId = 1;
        } else {
            currentTx = this.transactionId++;
        }
        this.currentTxId = currentTx;
        packet.putInt(currentTx);
        for (int p : params) packet.putInt(p);

        byte[] bytes = packet.array();
        int offset = 0;
        int remaining = length;
        int retries = 0;
        int lastWritten = 0;
        final int maxRetries = 3;

        Log.d(TAG, String.format(Locale.US, "[PTP_WRITE_START] OpCode=0x%04X (%s) TxID=%d Len=%d to BulkOUT=0x%02X",
            code, getOpCodeName(code), currentTx, length, bulkOut != null ? bulkOut.getAddress() : 0));

        while (remaining > 0) {
            if (bulkOut == null || connection == null) {
                String errMsg = "Koneksi USB atau endpoint Bulk OUT bernilai null sebelum command dikirim.";
                setStageFailed(currentPtpStage, errMsg);
                throw new IOException(errMsg);
            }

            long startMs = System.currentTimeMillis();
            lastWritten = connection.bulkTransfer(bulkOut, bytes, offset, remaining, USB_TRANSFER_TIMEOUT_MS);
            long elapsedMs = System.currentTimeMillis() - startMs;

            if (lastWritten > 0) {
                offset += lastWritten;
                remaining -= lastWritten;
                retries = 0;
                Log.d(TAG, String.format(Locale.US, "[PTP_WRITE_CHUNK] Wrote %d bytes (offset=%d/%d, elapsed=%dms)",
                    lastWritten, offset, length, elapsedMs));
            } else {
                retries++;
                boolean isTimeout = elapsedMs >= (USB_TRANSFER_TIMEOUT_MS - 500);
                boolean isStalled = isEndpointHalted(connection, bulkOut);
                String diag = buildWriteFailureDiagnostic(code, params, currentTx, length, offset, remaining, lastWritten, retries);
                Log.w(TAG, String.format(Locale.US, "[PTP_WRITE_RETRY] %s (Type=%s, Elapsed=%dms, IsStalled=%b)",
                    diag, isTimeout ? "TIMEOUT" : (isStalled ? "STALL" : "IOCTL_FAIL"), elapsedMs, isStalled));

                // ONLY clear halt IF endpoint is actually stalled!
                if (isStalled) {
                    boolean cleared = clearEndpointHalt(connection, bulkOut);
                    lastHaltRecoveryStatus = cleared ? "OUT_HALT_CLEARED" : "OUT_CLEAR_HALT_FAILED";
                }

                if (retries >= maxRetries) {
                    setStageFailed(currentPtpStage, diag);
                    Log.e(TAG, "[PTP_WRITE_FATAL] " + diag);
                    throw new IOException(diag);
                }

                try {
                    Thread.sleep(50 * retries);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IOException("Proses penulisan USB terinterupsi saat retry OpCode " + getOpCodeName(code), e);
                }
            }
        }
        Log.d(TAG, String.format(Locale.US, "[PTP_WRITE_SUCCESS] OpCode=0x%04X (%s) TxID=%d %d bytes transferred",
            code, getOpCodeName(code), currentTx, length));
    }

    private int readUntilResponse(String operation) throws IOException {
        while (!isInterrupted.get() && (isConnected || isTransportOpen) && connection != null) {
            Container container = readContainer();
            if (container.type == PTP_TYPE_DATA) {
                if (container.code == PTP_OC_GetDeviceInfo) {
                    parseDeviceInfo(container.raw);
                } else if (container.code == PTP_OC_SONY_GetAllExtDeviceInfo || container.code == PTP_OC_SONY_GetSDIOGetExtDeviceInfo) {
                    parseProperties(container.raw);
                }
            } else if (container.type == PTP_TYPE_EVENT) {
                Log.d(TAG, String.format(Locale.US, "PTP EVENT ON BULK IN: %s -> Code=0x%04X TxID=%d", 
                    operation, container.code, container.transaction));
            } else if (container.type == PTP_TYPE_RESPONSE) {
                Log.d(TAG, String.format(Locale.US, "PTP RESPONSE: %s -> Code=0x%04X TxID=%d", 
                    operation, container.code, container.transaction));
                return container.code;
            }
        }
        throw new IOException("No PTP response received for " + operation);
    }

    private Container readObjectDataContainer() throws IOException {
        return readObjectDataContainer(-1);
    }

    public Container readObjectDataContainer(long expectedPayloadSize) throws IOException {
        String parentStage = currentPtpStage;
        currentPtpStage = parentStage + ":READ_DATA_HEADER";
        ensureIncoming(12);

        ByteBuffer header = ByteBuffer.wrap(incoming, 0, 12).order(ByteOrder.LITTLE_ENDIAN);
        long declaredLength = header.getInt() & 0xFFFFFFFFL;
        int type = header.getShort() & 0xFFFF;
        int code = header.getShort() & 0xFFFF;
        int tx = header.getInt();

        lastContainerType = type;
        lastContainerCode = code;
        lastContainerLength = (int) Math.min(declaredLength, Integer.MAX_VALUE);
        lastContainerTxId = tx;

        Log.i(TAG, String.format(Locale.US,
            "📦 [%s] [PTP_DATA_CONTAINER_HEADER] OpCode=0x%04X (%s), TxID=%d, Type=%d, DeclaredLen=%d bytes, ExpectedPayload=%d bytes, Stage=%s",
            currentCorrelationId, code, getOpCodeName(code), tx, type, declaredLength, expectedPayloadSize, currentPtpStage));

        // If camera returned a RESPONSE container directly (e.g. error code)
        if (type == PTP_TYPE_RESPONSE) {
            int respLen = (int) (declaredLength >= 12 && declaredLength <= 1024 ? declaredLength : 12);
            ensureIncoming(respLen);
            byte[] respRaw = new byte[respLen];
            System.arraycopy(incoming, 0, respRaw, 0, respLen);
            consumeIncoming(respLen);
            currentPtpStage = parentStage;
            return new Container(type, code, tx, respRaw);
        }

        if (type != PTP_TYPE_DATA) {
            String err = String.format(Locale.US,
                "Unexpected PTP container type in data phase: %d (OpCode=0x%04X, TxID=%d)",
                type, code, tx);
            setStageFailed(currentPtpStage, err);
            throw new IOException(err);
        }

        if (declaredLength == 12) {
            // Container has zero payload bytes (camera RAM buffer not yet filled or empty)
            Log.w(TAG, String.format(Locale.US,
                "⚠️ [%s] [PTP_DATA_CONTAINER_EMPTY] Container declared length is exactly 12 (0 payload bytes) for OpCode=0x%04X (%s), TxID=%d!",
                currentCorrelationId, code, getOpCodeName(code), tx));
            ensureIncoming(12);
            byte[] rawEmpty = new byte[12];
            System.arraycopy(incoming, 0, rawEmpty, 0, 12);
            consumeIncoming(12);
            currentPtpStage = parentStage;
            return new Container(type, code, tx, rawEmpty);
        }

        long totalTargetLength;
        if (expectedPayloadSize > 0) {
            if (declaredLength != 0xFFFFFFFFL && declaredLength > 12 + expectedPayloadSize) {
                totalTargetLength = declaredLength;
            } else {
                totalTargetLength = 12 + expectedPayloadSize;
            }
        } else if (declaredLength > 12 && declaredLength != 0xFFFFFFFFL) {
            totalTargetLength = declaredLength;
        } else {
            totalTargetLength = -1; // Unbounded / unknown length (only when declaredLength == 0xFFFFFFFFL)
        }

        if (totalTargetLength > 32 * 1024 * 1024) {
            String err = String.format(Locale.US,
                "PTP data container target length exceeds safety limit: %d bytes (OpCode=0x%04X, TxID=%d)",
                totalTargetLength, code, tx);
            setStageFailed(currentPtpStage, err);
            throw new IOException(err);
        }

        long readStart = System.currentTimeMillis();

        if (totalTargetLength != -1) {
            int targetInt = (int) totalTargetLength;
            currentPtpStage = parentStage + ":READ_DATA_PAYLOAD(TargetLen=" + targetInt + ")";
            ensureIncoming(targetInt);

            byte[] raw = new byte[targetInt];
            System.arraycopy(incoming, 0, raw, 0, targetInt);
            consumeIncoming(targetInt);

            long readDuration = System.currentTimeMillis() - readStart;
            Log.i(TAG, String.format(Locale.US,
                "📥 [%s] [PTP_DATA_TRANSFER_COMPLETE] Read %d total bytes in %dms (Payload=%d bytes, OpCode=0x%04X, TxID=%d, LeftoverInBuffer=%d)",
                currentCorrelationId, targetInt, readDuration, (targetInt - 12), code, tx, incomingLength));

            currentPtpStage = parentStage;
            return new Container(type, code, tx, raw);
        }

        // Unbounded / streaming mode: read until JPEG EOI + Response container or safety limit
        currentPtpStage = parentStage + ":READ_DATA_UNBOUNDED";
        Log.w(TAG, String.format(Locale.US, "[PTP_DATA_UNBOUNDED_START] Entering unbounded read mode for OpCode=0x%04X, TxID=%d (CurrentBuffer=%d)",
            code, tx, incomingLength));
        long startTime = System.currentTimeMillis();
        final int MAX_SAFE_UNBOUNDED = 32 * 1024 * 1024; // 32MB

        while (incomingLength < MAX_SAFE_UNBOUNDED && System.currentTimeMillis() - startTime < USB_TRANSFER_TIMEOUT_MS) {
            if (incomingLength >= 24) {
                int soi = -1;
                for (int i = 12; i < incomingLength - 1; i++) {
                    if ((incoming[i] & 0xFF) == 0xFF && (incoming[i + 1] & 0xFF) == 0xD8) {
                        soi = i;
                        break;
                    }
                }
                if (soi != -1) {
                    for (int i = incomingLength - 1; i > soi + 2; i--) {
                        if ((incoming[i - 1] & 0xFF) == 0xFF && (incoming[i] & 0xFF) == 0xD9) {
                            int eoi = i + 1; // End of JPEG
                            // Look for response container header after EOI
                            for (int r = eoi; r + 12 <= incomingLength; r++) {
                                ByteBuffer rbb = ByteBuffer.wrap(incoming, r, 12).order(ByteOrder.LITTLE_ENDIAN);
                                int rLen = rbb.getInt();
                                short rType = rbb.getShort();
                                short rCode = rbb.getShort();
                                int rTx = rbb.getInt();
                                if (rType == PTP_TYPE_RESPONSE && rTx == tx) {
                                    byte[] raw = new byte[r];
                                    System.arraycopy(incoming, 0, raw, 0, r);
                                    consumeIncoming(r);
                                    Log.i(TAG, String.format(Locale.US,
                                        "[PTP_DATA_UNBOUNDED_COMPLETE] Detected end of data phase at %d bytes (EOI at %d, Resp at %d)",
                                        r, eoi, r));
                                    currentPtpStage = parentStage;
                                    return new Container(type, code, tx, raw);
                                }
                            }
                            break;
                        }
                    }
                }
            }

            int prevLen = incomingLength;
            int chunkTimeout = isCapturing ? USB_TRANSFER_TIMEOUT_MS : ((incomingLength <= 12) ? STREAM_READ_TIMEOUT_MS : USB_TRANSFER_TIMEOUT_MS);
            try {
                ensureIncoming(incomingLength + USB_READ_CHUNK, chunkTimeout);
            } catch (IOException e) {
                Log.w(TAG, String.format(Locale.US, "[PTP_DATA_UNBOUNDED_TIMEOUT] Unbounded read stopped: %s (Buffer=%d bytes)",
                    e.getMessage(), incomingLength));
                break;
            }
            if (incomingLength == prevLen) {
                Log.w(TAG, "[PTP_DATA_UNBOUNDED] No new data received in unbounded read iteration, terminating.");
                break;
            }
        }

        if (incomingLength >= 1000) {
            byte[] raw = new byte[incomingLength];
            System.arraycopy(incoming, 0, raw, 0, incomingLength);
            consumeIncoming(incomingLength);
            currentPtpStage = parentStage;
            return new Container(type, code, tx, raw);
        }

        String err = "Timed out or exceeded safety limit reading unbounded PTP data container";
        setStageFailed(currentPtpStage, err);
        throw new IOException(err);
    }

    private void consumeIncoming(int length) {
        int leftover = incomingLength - length;
        if (leftover > 0) {
            byte[] rest = new byte[leftover];
            System.arraycopy(incoming, length, rest, 0, leftover);
            incoming = rest;
        } else {
            incoming = new byte[0];
        }
        incomingLength = Math.max(0, leftover);
    }

    public void setIncomingBufferForTesting(byte[] data) {
        if (data == null) {
            incoming = new byte[0];
            incomingLength = 0;
        } else {
            incoming = Arrays.copyOf(data, data.length);
            incomingLength = data.length;
        }
    }

    public int getIncomingLengthForTesting() {
        return incomingLength;
    }

    public byte[] getIncomingBufferForTesting() {
        return Arrays.copyOf(incoming, incomingLength);
    }

    private Container readContainer() throws IOException {
        String parentStage = currentPtpStage;
        currentPtpStage = parentStage + ":READ_CONTAINER_HEADER";
        ensureIncoming(12);

        ByteBuffer header = ByteBuffer.wrap(incoming, 0, 12).order(ByteOrder.LITTLE_ENDIAN);
        long lengthUnsigned = header.getInt() & 0xFFFFFFFFL;
        int length = (int) Math.min(lengthUnsigned, Integer.MAX_VALUE);
        short type = header.getShort();
        short code = header.getShort();
        int tx = header.getInt();

        lastContainerType = type & 0xFFFF;
        lastContainerCode = code & 0xFFFF;
        lastContainerLength = length;
        lastContainerTxId = tx;

        String threadName = Thread.currentThread().getName();
        String epStr = bulkIn != null ? String.format(Locale.US, "0x%02X", bulkIn.getAddress()) : "null";
        String typeStr;
        switch (type) {
            case PTP_TYPE_COMMAND: typeStr = "COMMAND(1)"; break;
            case PTP_TYPE_DATA: typeStr = "DATA(2)"; break;
            case PTP_TYPE_RESPONSE: typeStr = "RESPONSE(3)"; break;
            case PTP_TYPE_EVENT: typeStr = "EVENT(4)"; break;
            default: typeStr = "UNKNOWN(" + type + ")"; break;
        }
        Log.d(TAG, String.format(Locale.US, "[PTP_CONTAINER_READ] OpCode=0x%04X (%s) TxID=%d Type=%s Length=%d Endpoint=%s Thread=[%s] Stage=%s",
            code & 0xFFFF, getOpCodeName(code & 0xFFFF), tx, typeStr, lengthUnsigned, epStr, threadName, currentPtpStage));

        if (lengthUnsigned < 12 || lengthUnsigned > 32 * 1024 * 1024) {
            String err = String.format(Locale.US, "Invalid PTP container length: %d (Type=%d, Code=0x%04X, TxID=%d, Stage=%s)",
                lengthUnsigned, type, code & 0xFFFF, tx, currentPtpStage);
            setStageFailed(currentPtpStage, err);
            throw new IOException(err);
        }

        currentPtpStage = parentStage + ":READ_CONTAINER_PAYLOAD(Len=" + length + ")";
        ensureIncoming(length);
        byte[] raw = new byte[length];
        System.arraycopy(incoming, 0, raw, 0, length);

        consumeIncoming(length);

        currentPtpStage = parentStage;
        return new Container(type & 0xFFFF, code & 0xFFFF, tx, raw);
    }

    private void ensureIncoming(int needed) throws IOException {
        int timeoutMs = (isLiveViewRunning.get() && !isCapturing) ? STREAM_READ_TIMEOUT_MS : USB_TRANSFER_TIMEOUT_MS;
        ensureIncoming(needed, timeoutMs);
    }

    private void ensureIncoming(int needed, int timeoutMs) throws IOException {
        int failures = 0;

        while (incomingLength < needed && !isInterrupted.get() && (isConnected || isTransportOpen) && connection != null) {
            int remainingNeeded = needed - incomingLength;
            int toRead;

            // Reading container header: request 512 bytes (1x standard USB Bulk packet).
            // Payload reads: capped strictly to USB_READ_CHUNK (16,384 bytes = Linux usbfs MAX_USBFS_BUFFER_SIZE).
            // This prevents the kernel ioctl from returning -EINVAL (-22) / Android -1.
            if (remainingNeeded <= USB_HEADER_READ_SIZE) {
                toRead = USB_HEADER_READ_SIZE;
            } else {
                toRead = Math.min(USB_READ_CHUNK, ((remainingNeeded + 511) / 512) * 512);
            }

            lastRequestedBytes = toRead;
            lastBulkEndpoint = bulkIn != null ? String.format(Locale.US, "0x%02X", bulkIn.getAddress()) : "null";

            long startMs = System.currentTimeMillis();
            int count = connection.bulkTransfer(bulkIn, readChunk, 0, toRead, timeoutMs);
            long elapsedMs = System.currentTimeMillis() - startMs;
            lastBulkReturn = count;

            if (count > 0) {
                if (incoming.length < incomingLength + count) {
                    int newCap = Math.max(incomingLength + count, Math.max(needed, Math.max(1024, incoming.length * 2)));
                    byte[] grown = new byte[newCap];
                    System.arraycopy(incoming, 0, grown, 0, incomingLength);
                    incoming = grown;
                }
                System.arraycopy(readChunk, 0, incoming, incomingLength, count);
                incomingLength += count;
                failures = 0;
                Log.d(TAG, String.format(Locale.US, "[BULK_IN_OK] Read %d bytes from %s (elapsed=%dms, buffer=%d/%d, Stage=%s)",
                    count, lastBulkEndpoint, elapsedMs, incomingLength, needed, currentPtpStage));
            } else if (count == 0) {
                // USB Zero-Length Packet (ZLP), valid boundary delimiter
                failures++;
                Log.w(TAG, String.format(Locale.US, "[BULK_IN_ZLP] Received ZLP from %s (attempt %d/%d, Stage=%s)",
                    lastBulkEndpoint, failures, USB_READ_RETRIES, currentPtpStage));
                if (failures >= USB_READ_RETRIES) {
                    String msg = String.format(Locale.US,
                        "USB bulk read timed out on IN %s after %d ZLP attempts (Stage: %s)",
                        lastBulkEndpoint, failures, currentPtpStage);
                    setStageFailed(currentPtpStage, msg);
                    throw new IOException(msg);
                }
            } else {
                // count < 0 (-1)
                failures++;
                boolean isTimeout = elapsedMs >= (timeoutMs - 500);
                boolean isStalled = isEndpointHalted(connection, bulkIn);
                String failureType;
                if (connection == null) {
                    failureType = "USB_DISCONNECTED";
                } else if (isTimeout) {
                    failureType = "TRANSFER_TIMEOUT";
                } else if (isStalled) {
                    failureType = "ENDPOINT_STALL";
                } else {
                    failureType = "NATIVE_IOCTL_FAILURE";
                }

                String diagMsg = String.format(Locale.US,
                    "USB bulk read failed: %d on IN %s (Type=%s, Elapsed=%dms, Requested=%dB, Stage=%s, Attempt=%d/%d)",
                    count, lastBulkEndpoint, failureType, elapsedMs, toRead, currentPtpStage, failures, USB_READ_RETRIES);
                Log.w(TAG, "[BULK_IN_FAIL] " + diagMsg);

                // Robust recovery: only clear halt if endpoint is actually stalled
                if (isStalled) {
                    boolean cleared = clearEndpointHalt(connection, bulkIn);
                    lastHaltRecoveryStatus = cleared ? "IN_HALT_CLEARED" : "IN_CLEAR_HALT_FAILED";
                }

                if (failures >= USB_READ_RETRIES) {
                    String fatalError = String.format(Locale.US,
                        "USB bulk read failed: %d on IN %s [Type: %s, Elapsed: %dms, Requested: %dB, Stage: %s, HaltStatus: %s]",
                        count, lastBulkEndpoint, failureType, elapsedMs, toRead, currentPtpStage, lastHaltRecoveryStatus);
                    setStageFailed(currentPtpStage, fatalError);
                    throw new IOException(fatalError);
                }

                try {
                    Thread.sleep(50 * failures);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IOException("USB read interrupted during retry", e);
                }
            }
        }
    }

    private void parseDeviceInfo(byte[] raw) {
        try {
            if (raw.length < 24) return;
            ByteBuffer buf = ByteBuffer.wrap(raw, 12, raw.length - 12).order(ByteOrder.LITTLE_ENDIAN);
            buf.getShort(); // standard version
            buf.getInt();   // vendor extension id
            buf.getShort(); // vendor extension version
            skipPtpString(buf);
            buf.getShort(); // functional mode
            skipPtpArray(buf, 2); // operations
            skipPtpArray(buf, 2); // events
            skipPtpArray(buf, 2); // props
            skipPtpArray(buf, 2); // capture formats
            skipPtpArray(buf, 2); // image formats

            String mfg = readPtpString(buf);
            if (!mfg.isEmpty()) manufacturer = mfg;
            String model = readPtpString(buf);
            if (!model.isEmpty()) cameraModel = model;
            readPtpString(buf); // version
            String serial = readPtpString(buf);
            if (!serial.isEmpty()) serialNumber = serial;

            Log.i(TAG, "[PARSED_DEVICE_INFO] Camera: " + cameraModel + " | Mfg: " + manufacturer + " | S/N: " + serialNumber);
        } catch (Throwable t) {
            Log.w(TAG, "Notice parsing DeviceInfo: " + t.getMessage());
        }
    }

    private void parseProperties(byte[] container) {
        if (container.length < 20) return;
        long count = u64(container, 12);
        int i = 20;
        Integer battery = null;
        Integer shutter = null;
        Integer aperture = null;
        Integer iso = null;

        for (int record = 0; record < count && i + 10 <= container.length; record++) {
            int code = u16(container, i);
            int datatype = u16(container, i + 2);
            i += 4;
            if (datatype == 0x0000 || code == 0x0000) {
                i += 4;
                continue;
            }
            supportedProperties.add(code);
            i += 2;
            int dataSize = dataSize(datatype);
            if (datatype == 0xFFFF) {
                if (i >= container.length) break;
                int elements = container[i++] & 0xFF;
                i += elements * 2;
            } else if (dataSize > 0) {
                if (i + dataSize > container.length) break;
                i += dataSize; // skip factory default
                if (i + dataSize > container.length) break;
                long value = readValue(container, i, dataSize, datatype);
                i += dataSize;

                if (code == SONY_BATTERY_LEVEL && value >= 0 && value <= 100) {
                    battery = (int) value;
                } else if (code == SONY_SHUTTER_SPEED) {
                    shutter = (int) value;
                } else if (code == SONY_FNUMBER) {
                    aperture = (int) value;
                } else if (code == SONY_ISO) {
                    iso = (int) value;
                }
            } else {
                break;
            }

            if (i >= container.length) break;
            int form = container[i++] & 0xFF;
            if (form == 0x01) {
                i += 3 * dataSize;
            } else if (form == 0x02) {
                if (i + 2 > container.length) break;
                int elements = u16(container, i);
                i += 2 + elements * dataSize;
            }
            if (form != 0x01 && form != 0x02 && form != 0xFF && form != 0x00) break;
        }

        if (battery != null && battery != lastBatteryPercent) {
            lastBatteryPercent = battery;
            Log.i(TAG, "[BATTERY] Sony Camera Battery Level: " + battery + "% (0xD218)");
            if (eventListener != null) {
                eventListener.onBatteryChanged(battery);
            }
        }

        String exposure = formatExposure(shutter, aperture, iso);
        if (exposure != null && !exposure.equals(lastExposureLabel)) {
            lastExposureLabel = exposure;
            Log.d(TAG, "[EXPOSURE] " + exposure);
        }
    }

    private String formatExposure(Integer shutter, Integer aperture, Integer iso) {
        String s = null;
        if (shutter != null && shutter != 0 && shutter != 0xFFFFFFFF) {
            int num = (shutter >>> 16) & 0xFFFF;
            int den = shutter & 0xFFFF;
            if (num > 0 && den > 0) {
                s = (den == 1) ? (num + "s") : (num == 1 ? ("1/" + den + "s") : (num + "/" + den + "s"));
            }
        }
        String a = null;
        if (aperture != null && aperture > 0) {
            a = String.format(Locale.US, "f/%.1f", aperture / 100.0);
        }
        String is = null;
        if (iso != null && iso != 0) {
            is = (iso & 0xFFFFFF) == 0xFFFFFF ? "ISO AUTO" : "ISO " + (iso & 0xFFFFFF);
        }
        if (s == null && a == null && is == null) return null;
        StringBuilder sb = new StringBuilder();
        if (s != null) sb.append(s);
        if (a != null) {
            if (sb.length() > 0) sb.append(" · ");
            sb.append(a);
        }
        if (is != null) {
            if (sb.length() > 0) sb.append(" · ");
            sb.append(is);
        }
        return sb.toString();
    }

    private static int dataSize(int datatype) {
        switch (datatype & 0x0F) {
            case 1: case 2: return 1;
            case 3: case 4: return 2;
            case 5: case 6: return 4;
            case 7: case 8: return 8;
            case 9: case 10: return 16;
            default: return 0;
        }
    }

    private static long readValue(byte[] bytes, int offset, int size, int datatype) {
        long value = 0;
        for (int k = size - 1; k >= 0; k--) {
            value = (value << 8) | (bytes[offset + k] & 0xFF);
        }
        if ((datatype & 1) == 1) {
            int bits = size * 8;
            if (bits < 64 && (value & (1L << (bits - 1))) != 0) {
                value |= -1L << bits;
            }
        }
        return value;
    }

    private static int u16(byte[] bytes, int offset) {
        return (bytes[offset] & 0xFF) | ((bytes[offset + 1] & 0xFF) << 8);
    }

    private static long u64(byte[] bytes, int offset) {
        long value = 0;
        for (int k = 7; k >= 0; k--) {
            value = (value << 8) | (bytes[offset + k] & 0xFF);
        }
        return value;
    }

    private void skipPtpArray(ByteBuffer buf, int elementSize) {
        if (buf.remaining() < 4) return;
        int count = buf.getInt();
        int bytesToSkip = count * elementSize;
        if (buf.remaining() >= bytesToSkip) {
            buf.position(buf.position() + bytesToSkip);
        }
    }

    private void skipPtpString(ByteBuffer buf) {
        if (buf.remaining() < 1) return;
        int numChars = buf.get() & 0xFF;
        int bytesToSkip = numChars * 2;
        if (buf.remaining() >= bytesToSkip) {
            buf.position(buf.position() + bytesToSkip);
        }
    }

    private String readPtpString(ByteBuffer buf) {
        if (buf.remaining() < 1) return "";
        int numChars = buf.get() & 0xFF;
        if (numChars == 0) return "";
        int byteCount = numChars * 2;
        if (buf.remaining() < byteCount) return "";
        byte[] strBytes = new byte[byteCount];
        buf.get(strBytes);
        try {
            return new String(strBytes, "UTF-16LE").replace("\0", "").trim();
        } catch (Throwable e) {
            return "";
        }
    }

    // --- Clean Resource Teardown ---

    public void disconnect() {
        synchronized (usbLock) {
            disconnectInternal(true);
        }
    }

    private void disconnectInternal(boolean notify) {
        Log.i(TAG, "[DISCONNECT] Disconnecting Sony camera cleanly...");
        isInterrupted.set(true);

        stopLiveView();

        if (eventThread != null && eventThread.isAlive()) {
            eventThread.interrupt();
            eventThread = null;
        }

        if (isSessionOpen && connection != null) {
            try {
                sendCommand(PTP_OC_CloseSession);
            } catch (Throwable ignored) {}
            isSessionOpen = false;
        }

        if (connection != null && usbInterface != null) {
            try {
                connection.releaseInterface(usbInterface);
            } catch (Throwable ignored) {}
        }

        if (connection != null) {
            try {
                connection.close();
            } catch (Throwable ignored) {}
            connection = null;
        }

        isConnected = false;
        isCapturing = false;
        isSoftwareCapturing = false;
        isLiveViewPaused.set(false);
        supportedProperties.clear();
        if (focusLockLatch != null) {
            focusLockLatch.countDown();
            focusLockLatch = null;
        }
        if (photoReadyLatch != null) {
            photoReadyLatch.countDown();
            photoReadyLatch = null;
        }
        isTransportOpen = false;
        usbDevice = null;
        usbInterface = null;
        bulkIn = null;
        bulkOut = null;
        interruptIn = null;
        lastSuccessfulStage = "DISCONNECTED";
        currentPtpStage = "IDLE";
        currentOpCode = 0;
        currentTxId = 0;
        lastBulkReturn = 0;
        lastRequestedBytes = 0;
        lastBulkEndpoint = "";
        lastHaltRecoveryStatus = "RESET";
        updateState(STATE_DISCONNECTED, "Kamera Sony terputus.");

        if (notify && eventListener != null) {
            eventListener.onCameraDisconnected();
        }
        Log.i(TAG, "[DISCONNECT_COMPLETE] Sony camera disconnected.");
    }

    private static final class Container {
        final int type;
        final int code;
        final int transaction;
        final byte[] raw;

        Container(int type, int code, int transaction, byte[] raw) {
            this.type = type;
            this.code = code;
            this.transaction = transaction;
            this.raw = raw;
        }
    }

    // --- Embedded Loopback MJPEG & Single-Frame HTTP Server (Port 4949) ---

    private class LiveViewHttpServer {
        private final int port;
        private ServerSocket serverSocket;
        private Thread serverThread;
        private final AtomicBoolean running = new AtomicBoolean(false);

        public LiveViewHttpServer(int port) {
            this.port = port;
        }

        public void start() throws IOException {
            serverSocket = new ServerSocket(port, 10, InetAddress.getByName("127.0.0.1"));
            serverSocket.setReuseAddress(true);
            running.set(true);

            serverThread = new Thread(() -> {
                Log.i(TAG, "[HTTP_SERVER] Listening on http://127.0.0.1:" + port + "/liveview");
                while (running.get() && serverSocket != null && !serverSocket.isClosed()) {
                    try {
                        Socket client = serverSocket.accept();
                        new Thread(() -> handleClient(client), "LiveViewClientHandler").start();
                    } catch (IOException e) {
                        if (!running.get()) break;
                    }
                }
                Log.i(TAG, "[HTTP_SERVER] Server socket listener terminated.");
            }, "LiveViewHttpServer");

            serverThread.setDaemon(true);
            serverThread.start();
        }

        public void stop() {
            running.set(false);
            if (serverSocket != null) {
                try {
                    serverSocket.close();
                } catch (Throwable ignored) {}
                serverSocket = null;
            }
            if (serverThread != null) {
                serverThread.interrupt();
                serverThread = null;
            }
        }

        private void handleClient(Socket socket) {
            try {
                socket.setSoTimeout(4000);
                InputStream in = socket.getInputStream();
                OutputStream out = socket.getOutputStream();

                byte[] reqBuf = new byte[1024];
                int read = in.read(reqBuf);
                if (read <= 0) {
                    socket.close();
                    return;
                }
                String req = new String(reqBuf, 0, read);

                if (req.contains("GET /liveview.jpg")) {
                    // Single JPEG frame endpoint
                    byte[] frame = latestJpegFrame;
                    if (frame == null || frame.length == 0) {
                        // Return 503 while waiting for initial sensor frame
                        String headers = "HTTP/1.1 503 Service Unavailable\r\n" +
                                "Content-Type: text/plain\r\n" +
                                "Retry-After: 1\r\n" +
                                "Access-Control-Allow-Origin: *\r\n" +
                                "Connection: close\r\n\r\n" +
                                "Waiting for initial sensor frame...";
                        out.write(headers.getBytes("UTF-8"));
                        out.flush();
                        socket.close();
                        return;
                    }

                    String headers = "HTTP/1.1 200 OK\r\n" +
                            "Content-Type: image/jpeg\r\n" +
                            "Content-Length: " + frame.length + "\r\n" +
                            "Access-Control-Allow-Origin: *\r\n" +
                            "Cache-Control: no-cache, no-store, must-revalidate\r\n" +
                            "Pragma: no-cache\r\n" +
                            "Connection: close\r\n\r\n";
                    out.write(headers.getBytes("UTF-8"));
                    out.write(frame);
                    out.flush();
                    socket.close();
                } else {
                    // Continuous Multipart MJPEG Stream
                    String headers = "HTTP/1.1 200 OK\r\n" +
                            "Content-Type: multipart/x-mixed-replace; boundary=boundarydonotcross\r\n" +
                            "Access-Control-Allow-Origin: *\r\n" +
                            "Cache-Control: no-cache, no-store, must-revalidate\r\n" +
                            "Pragma: no-cache\r\n" +
                            "Connection: close\r\n\r\n";
                    out.write(headers.getBytes("UTF-8"));
                    out.flush();

                    byte[] lastSentFrame = null;
                    while (running.get() && !socket.isClosed() && isLiveViewRunning.get()) {
                        byte[] frame = latestJpegFrame;
                        if (frame != null && frame.length > 200 && frame != lastSentFrame) {
                            lastSentFrame = frame;
                            String partHeader = "--boundarydonotcross\r\n" +
                                    "Content-Type: image/jpeg\r\n" +
                                    "Content-Length: " + frame.length + "\r\n\r\n";
                            out.write(partHeader.getBytes("UTF-8"));
                            out.write(frame);
                            out.write("\r\n".getBytes("UTF-8"));
                            out.flush();
                        }
                        Thread.sleep(25);
                    }
                }
            } catch (Throwable ignored) {
            } finally {
                try {
                    socket.close();
                } catch (Throwable ignored) {}
            }
        }
    }
}
