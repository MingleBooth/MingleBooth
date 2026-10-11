// apps/desktop/electron/native/windows/sony_camera_runner_win.cpp
// Sony Camera Remote SDK 2.02.00 Production Runner for MingleBooth (Windows)
// Strictly scoped to physically verified model: Sony ILCE-7CM2 (α7C II)
// Hardware ID: USB\VID_054C&PID_0E8C | Driver: SONY REMOTE CAMERA DRIVER (libusbK)
// Protocol Contract: Machine-parseable stdout for Electron SonyCameraBackend; diagnostics to stderr.

#if !defined(_WIN32) && !defined(_WIN64)
  #error "sony_camera_runner_win.cpp must be compiled on Windows x64 using MSVC."
#endif

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <future>
#include <iostream>
#include <iomanip>
#include <fstream>
#include <filesystem>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
#include <atomic>
#include <algorithm>

namespace fs = std::filesystem;

#include "CameraRemote_SDK.h"
#include "CrDeviceProperty.h"
#include "IDeviceCallback.h"
#include "CrError.h"

// Convert Windows wchar_t (CrWChar) to UTF-8 std::string
static std::string WCharToUtf8(const wchar_t* wstr)
{
    if (!wstr || *wstr == L'\0') return "";
    int sizeNeeded = WideCharToMultiByte(CP_UTF8, 0, wstr, -1, NULL, 0, NULL, NULL);
    if (sizeNeeded <= 0) return "";
    std::string str(sizeNeeded - 1, 0);
    WideCharToMultiByte(CP_UTF8, 0, wstr, -1, &str[0], sizeNeeded, NULL, NULL);
    return str;
}

// Convert UTF-8 std::string to Windows wchar_t (std::wstring)
static std::wstring Utf8ToWChar(const std::string& str)
{
    if (str.empty()) return L"";
    int sizeNeeded = MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, NULL, 0);
    if (sizeNeeded <= 0) return L"";
    std::wstring wstr(sizeNeeded - 1, 0);
    MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, &wstr[0], sizeNeeded);
    return wstr;
}

// Fast Base64 encoding table
static const char b64_table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
static std::string base64_encode(const unsigned char* data, size_t input_len)
{
    std::string ret;
    ret.reserve(((input_len + 2) / 3) * 4);
    for (size_t i = 0; i < input_len; i += 3) {
        uint32_t val = (data[i] << 16);
        if (i + 1 < input_len) val |= (data[i + 1] << 8);
        if (i + 2 < input_len) val |= data[i + 2];
        ret.push_back(b64_table[(val >> 18) & 0x3F]);
        ret.push_back(b64_table[(val >> 12) & 0x3F]);
        ret.push_back((i + 1 < input_len) ? b64_table[(val >> 6) & 0x3F] : '=');
        ret.push_back((i + 2 < input_len) ? b64_table[val & 0x3F] : '=');
    }
    return ret;
}

// JPEG format validator
struct JpegInfo {
    bool validSoi = false;
    bool validEoi = false;
    uint32_t width = 0;
    uint32_t height = 0;
};

static JpegInfo ParseJpeg(const uint8_t* data, size_t size, uint32_t fallbackWidth = 0, uint32_t fallbackHeight = 0)
{
    JpegInfo info;
    info.width = fallbackWidth;
    info.height = fallbackHeight;

    if (size < 4) return info;

    // Check Start of Image (SOI): 0xFF, 0xD8 at offset 0
    if (data[0] == 0xFF && data[1] == 0xD8) {
        info.validSoi = true;
    }

    // Check End of Image (EOI): 0xFF, 0xD9
    // Scan backwards from the end within trailing 512 bytes to account for USB packet alignment or padding
    size_t searchLimit = (size > 512) ? (size - 512) : 0;
    for (size_t k = size; k >= searchLimit + 2; --k) {
        if (data[k - 2] == 0xFF && data[k - 1] == 0xD9) {
            info.validEoi = true;
            break;
        }
    }

    // Scan for Start of Frame (SOF0: 0xFFC0, SOF1: 0xFFC1, SOF2: 0xFFC2)
    size_t i = 2;
    while (i + 4 < size) {
        if (data[i] == 0xFF) {
            while (i + 1 < size && data[i + 1] == 0xFF) {
                i++;
            }
            if (i + 1 >= size) break;

            uint8_t marker = data[i + 1];
            if (marker == 0xD8) { // SOI
                i += 2;
                continue;
            }
            if (marker == 0xD9 || marker == 0xDA) { // EOI or SOS
                break;
            }
            if (marker == 0x00) { // Byte stuffing
                i += 2;
                continue;
            }

            if (marker == 0xC0 || marker == 0xC1 || marker == 0xC2) {
                if (i + 8 < size) {
                    info.height = (static_cast<uint32_t>(data[i + 5]) << 8) | data[i + 6];
                    info.width = (static_cast<uint32_t>(data[i + 7]) << 8) | data[i + 8];
                }
                break;
            }

            if (i + 3 < size) {
                uint16_t segLen = (static_cast<uint16_t>(data[i + 2]) << 8) | data[i + 3];
                if (segLen < 2) break;
                i += 2 + segLen;
            } else {
                break;
            }
        } else {
            i++;
        }
    }

    return info;
}

// Global camera state & synchronization
static std::atomic<bool> g_connected{false};
static std::string g_modelName = "";
static SCRSDK::CrDeviceHandle g_deviceHandle = 0;
static fs::path g_tetherDir;

static std::mutex g_promiseMutex;
static std::promise<void>* g_connectPromise = nullptr;
static std::promise<void>* g_disconnectPromise = nullptr;
static std::atomic<uint32_t> g_lastErrorCode{0};
static std::atomic<bool> g_sessionAlreadyOpened{false};

static std::mutex g_focusMutex;
static std::promise<void>* g_focusPromise = nullptr;

static std::mutex g_downloadMutex;
static std::promise<std::string>* g_downloadPromise = nullptr;

static std::atomic<bool> g_liveViewRunning{false};
static std::atomic<bool> g_liveViewPaused{false};
static std::thread g_liveViewThread;

// Helper: Query device property via Sony SDK
static SCRSDK::CrError getDeviceProperty(SCRSDK::CrDeviceHandle handle, uint32_t code, SCRSDK::CrDeviceProperty* outProp)
{
    std::int32_t nprop = 0;
    SCRSDK::CrDeviceProperty* prop_list = nullptr;
    SCRSDK::CrError err = SCRSDK::GetSelectDeviceProperties(handle, 1, &code, &prop_list, &nprop);
    if (err == SCRSDK::CrError_None && prop_list && nprop >= 1) {
        *outProp = prop_list[0];
    }
    if (prop_list) {
        SCRSDK::ReleaseDeviceProperties(handle, prop_list);
    }
    return err;
}

// Helper: Configure camera for PC Remote and original transfer
static bool setupCameraProperties(SCRSDK::CrDeviceHandle handle)
{
    std::cerr << "[CONFIG] Configuring PC Remote and transfer properties..." << std::endl;
    bool allOk = true;

    // 1. PriorityKeySettings -> PC Remote (0x0002)
    SCRSDK::CrDeviceProperty priorityProp;
    if (getDeviceProperty(handle, SCRSDK::CrDeviceProperty_PriorityKeySettings, &priorityProp) == SCRSDK::CrError_None) {
        if (priorityProp.GetCurrentValue() != SCRSDK::CrPriorityKey_PCRemote) {
            priorityProp.SetCurrentValue(SCRSDK::CrPriorityKey_PCRemote);
            SCRSDK::CrError err = SCRSDK::SetDeviceProperty(handle, &priorityProp);
            std::cerr << "  - PriorityKeySettings -> PCRemote: " << (err == SCRSDK::CrError_None ? "PASS" : "FAIL") << std::endl;
            if (err != SCRSDK::CrError_None) allOk = false;
        } else {
            std::cerr << "  - PriorityKeySettings: already PCRemote" << std::endl;
        }
    }

    // 2. StillImageStoreDestination -> HostPCAndMemoryCard (0x0003)
    SCRSDK::CrDeviceProperty destProp;
    if (getDeviceProperty(handle, SCRSDK::CrDeviceProperty_StillImageStoreDestination, &destProp) == SCRSDK::CrError_None) {
        if (destProp.GetCurrentValue() != SCRSDK::CrStillImageStoreDestination_HostPCAndMemoryCard) {
            destProp.SetCurrentValue(SCRSDK::CrStillImageStoreDestination_HostPCAndMemoryCard);
            SCRSDK::CrError err = SCRSDK::SetDeviceProperty(handle, &destProp);
            std::cerr << "  - StillImageStoreDestination -> HostPCAndMemoryCard: " << (err == SCRSDK::CrError_None ? "PASS" : "FAIL") << std::endl;
            if (err != SCRSDK::CrError_None) allOk = false;
        } else {
            std::cerr << "  - StillImageStoreDestination: already HostPCAndMemoryCard" << std::endl;
        }
    }

    // 3. Still_Image_Trans_Size -> Original (0x0000)
    SCRSDK::CrDeviceProperty sizeProp;
    if (getDeviceProperty(handle, SCRSDK::CrDeviceProperty_Still_Image_Trans_Size, &sizeProp) == SCRSDK::CrError_None) {
        if (sizeProp.GetCurrentValue() != SCRSDK::CrPropertyStillImageTransSize_Original) {
            sizeProp.SetCurrentValue(SCRSDK::CrPropertyStillImageTransSize_Original);
            SCRSDK::CrError err = SCRSDK::SetDeviceProperty(handle, &sizeProp);
            std::cerr << "  - Still_Image_Trans_Size -> Original: " << (err == SCRSDK::CrError_None ? "PASS" : "FAIL") << std::endl;
            if (err != SCRSDK::CrError_None) allOk = false;
        } else {
            std::cerr << "  - Still_Image_Trans_Size: already Original" << std::endl;
        }
    }

    return allOk;
}

// Live View background worker thread
static void liveViewWorker()
{
    std::cerr << "[LIVEVIEW] Worker thread started" << std::endl;

    SCRSDK::CrImageInfo imgInfo;
    SCRSDK::CrError infoErr = SCRSDK::GetLiveViewImageInfo(g_deviceHandle, &imgInfo);
    CrInt32u bufSize = (infoErr == SCRSDK::CrError_None && imgInfo.GetBufferSize() > 0) ? imgInfo.GetBufferSize() : (1024 * 1024);
    std::vector<CrInt8u> frameBuffer(bufSize);
    SCRSDK::CrImageDataBlock imageData;

    while (g_liveViewRunning.load()) {
        if (g_liveViewPaused.load()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(20));
            continue;
        }

        imageData.SetSize(static_cast<CrInt32u>(frameBuffer.size()));
        imageData.SetData(frameBuffer.data());

        SCRSDK::CrError lvErr = SCRSDK::GetLiveViewImage(g_deviceHandle, &imageData);
        if (lvErr == SCRSDK::CrError_None) {
            uint32_t imgSize = imageData.GetImageSize();
            if (imgSize > 2) {
                const uint8_t* p = reinterpret_cast<const uint8_t*>(imageData.GetImageData());
                if (p[0] == 0xFF && p[1] == 0xD8) {
                    std::string b64 = base64_encode(p, imgSize);
                    std::cout << "LV_FRAME:" << b64 << "\n" << std::flush;
                } else {
                    // Check for possible leading header offset
                    for (size_t o = 0; o + 1 < imgSize && o < 128; ++o) {
                        if (p[o] == 0xFF && p[o + 1] == 0xD8) {
                            std::string b64 = base64_encode(p + o, imgSize - o);
                            std::cout << "LV_FRAME:" << b64 << "\n" << std::flush;
                            break;
                        }
                    }
                }
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(30)); // ~30 FPS
        } else if (lvErr == SCRSDK::CrWarning_Frame_NotUpdated) {
            // Benign polling condition: wait 10ms
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        } else {
            std::this_thread::sleep_for(std::chrono::milliseconds(25));
        }
    }

    std::cerr << "[LIVEVIEW] Worker thread stopped" << std::endl;
}

static void startLiveView()
{
    if (g_liveViewRunning.load()) {
        if (g_liveViewPaused.load()) {
            g_liveViewPaused = false;
            std::cout << "LIVEVIEW_RESUMED\n" << std::flush;
        }
        return;
    }
    g_liveViewRunning = true;
    g_liveViewPaused = false;
    g_liveViewThread = std::thread(liveViewWorker);
    std::cout << "LIVEVIEW_STARTED\n" << std::flush;
}

static void stopLiveView()
{
    if (!g_liveViewRunning.load()) return;
    g_liveViewRunning = false;
    if (g_liveViewThread.joinable()) {
        g_liveViewThread.join();
    }
    std::cout << "LIVEVIEW_STOPPED\n" << std::flush;
}

// Device Callback implementation for Sony SDK
class WindowsDeviceCallback : public SCRSDK::IDeviceCallback
{
public:
    WindowsDeviceCallback() = default;
    virtual ~WindowsDeviceCallback() = default;

    void OnConnected(SCRSDK::DeviceConnectionVersioin version) override
    {
        std::cerr << "[CONNECT] success (DeviceConnectionVersion: 0x" 
                  << std::hex << std::uppercase << version << std::dec << ")" << std::endl;
        g_connected = true;
        g_sessionAlreadyOpened = false;
        std::lock_guard<std::mutex> lock(g_promiseMutex);
        if (g_connectPromise) {
            g_connectPromise->set_value();
            g_connectPromise = nullptr;
        }
    }

    void OnDisconnected(CrInt32u err) override
    {
        std::cerr << "[DISCONNECT] Device disconnected (code: 0x" 
                  << std::hex << std::uppercase << err << std::dec << ")" << std::endl;
        g_connected = false;
        g_liveViewRunning = false;
        std::cout << "DEVICE_DISCONNECTED\n" << std::flush;
        std::lock_guard<std::mutex> lock(g_promiseMutex);
        if (g_disconnectPromise) {
            g_disconnectPromise->set_value();
            g_disconnectPromise = nullptr;
        }
    }

    void OnPropertyChanged() override {}

    void OnPropertyChangedCodes(CrInt32u num, CrInt32u* codes) override
    {
        for (CrInt32u i = 0; i < num; ++i) {
            if (codes[i] == SCRSDK::CrDeviceProperty_FocusIndication) {
                SCRSDK::CrDeviceProperty devProp;
                if (getDeviceProperty(g_deviceHandle, codes[i], &devProp) == SCRSDK::CrError_None) {
                    uint32_t val = static_cast<uint32_t>(devProp.GetCurrentValue());
                    std::cerr << "  [CALLBACK] FocusIndication: 0x" << std::hex << std::uppercase << val << std::dec << std::endl;
                    if (val == SCRSDK::CrFocusIndicator_Focused_AF_S || val == SCRSDK::CrFocusIndicator_Focused_AF_C) {
                        std::lock_guard<std::mutex> lock(g_focusMutex);
                        if (g_focusPromise) {
                            g_focusPromise->set_value();
                            g_focusPromise = nullptr;
                        }
                    }
                }
            }
        }
    }

    void OnLvPropertyChanged() override {}
    void OnLvPropertyChangedCodes(CrInt32u, CrInt32u*) override {}

    void OnCompleteDownload(CrChar* filename, CrInt32u type = 0xFFFFFFFF) override
    {
        (void)type;
        std::string path = filename ? WCharToUtf8(filename) : "";
        std::cerr << "  [CALLBACK] OnCompleteDownload: " << path << std::endl;
        std::cerr << "  [POST-DOWNLOAD] callback received: " << path << std::endl;
        if (!path.empty()) {
            std::lock_guard<std::mutex> lock(g_downloadMutex);
            if (g_downloadPromise) {
                g_downloadPromise->set_value(path);
                g_downloadPromise = nullptr;
                std::cerr << "  [POST-DOWNLOAD] download promise fulfilled" << std::endl;
            } else {
                std::cerr << "  [POST-DOWNLOAD] WARNING: g_downloadPromise was null when callback arrived" << std::endl;
            }
        } else {
            std::cerr << "  [POST-DOWNLOAD] WARNING: callback path was empty" << std::endl;
        }
    }

    void OnNotifyContentsTransfer(CrInt32u notify, SCRSDK::CrContentHandle, CrChar* filename = 0) override
    {
        std::string fn = filename ? WCharToUtf8(filename) : "";
        std::cerr << "  [CALLBACK] OnNotifyContentsTransfer: " << fn 
                  << " (notify: 0x" << std::hex << notify << std::dec << ")" << std::endl;
    }

    void OnNotifyRemoteTransferResult(CrInt32u notify, CrInt32u per, CrChar* filename) override
    {
        std::string fn = filename ? WCharToUtf8(filename) : "";
        std::cerr << "  [CALLBACK] OnNotifyRemoteTransferResult: " << fn 
                  << " (notify: 0x" << std::hex << notify << std::dec << ", " << per << "%)" << std::endl;
        if (notify == SCRSDK::CrNotify_RemoteTransfer_Result_OK && !fn.empty()) {
            std::lock_guard<std::mutex> lock(g_downloadMutex);
            if (g_downloadPromise) {
                g_downloadPromise->set_value(fn);
                g_downloadPromise = nullptr;
                std::cerr << "  [POST-DOWNLOAD] download promise fulfilled via OnNotifyRemoteTransferResult" << std::endl;
            }
        }
    }

    void OnWarning(CrInt32u warning) override
    {
        std::cerr << "[WARNING] 0x" << std::hex << std::uppercase << warning << std::dec << std::endl;
    }

    void OnError(CrInt32u error) override
    {
        std::cerr << "[ERROR] SDK Error: 0x" << std::hex << std::uppercase << error << std::dec << std::endl;
        g_lastErrorCode = error;
        if (error == SCRSDK::CrError_Connect_SessionAlreadyOpened) {
            g_sessionAlreadyOpened = true;
        }
        std::lock_guard<std::mutex> lock(g_promiseMutex);
        if (g_connectPromise) {
            g_connectPromise->set_value();
            g_connectPromise = nullptr;
        }
    }
};

// Helper: Clean asynchronous disconnection waiting for camera firmware confirmation
static void safeDisconnect()
{
    if (g_connected.load() || g_deviceHandle != 0) {
        std::cerr << "[DISCONNECT] Initiating clean disconnect handshake..." << std::endl;
        std::promise<void> discPromise;
        {
            std::lock_guard<std::mutex> lock(g_promiseMutex);
            g_disconnectPromise = &discPromise;
        }
        SCRSDK::Disconnect(g_deviceHandle);
        discPromise.get_future().wait_for(std::chrono::seconds(2));
        {
            std::lock_guard<std::mutex> lock(g_promiseMutex);
            g_disconnectPromise = nullptr;
        }
    }
    if (g_deviceHandle != 0) {
        SCRSDK::ReleaseDevice(g_deviceHandle);
        g_deviceHandle = 0;
    }
    g_connected = false;
}

// Single physical capture routine
static bool executeSingleCapture(const std::string& destinationPath, std::string& outSavedPath, int64_t& outDurationMs)
{
    bool wasLiveView = g_liveViewRunning.load();
    if (wasLiveView) {
        g_liveViewPaused = true;
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }

    auto startTime = std::chrono::steady_clock::now();
    std::cerr << "[CAPTURE] Initiating physical capture sequence..." << std::endl;

    // Verify or create destination parent directory if specified
    if (!destinationPath.empty()) {
        try {
            fs::path dest(destinationPath);
            if (dest.has_parent_path()) {
                std::error_code ec;
                fs::create_directories(dest.parent_path(), ec);
            }
        } catch (const std::exception& e) {
            std::cerr << "[CAPTURE ERROR] Failed to create destination directory: " << e.what() << std::endl;
            std::cout << "CAPTURE_FAILED:INVALID_DESTINATION_PATH\n" << std::flush;
            std::cout << "CAMERA_RECOVERED_READY\n" << std::flush;
            if (wasLiveView) g_liveViewPaused = false;
            return false;
        }
    }

    std::promise<std::string> downloadPromise;
    std::future<std::string> downloadFuture = downloadPromise.get_future();
    {
        std::lock_guard<std::mutex> lock(g_downloadMutex);
        g_downloadPromise = &downloadPromise;
    }

    // 1. Verify PriorityKeySettings = PCRemote
    SCRSDK::CrDeviceProperty priorityProp;
    if (getDeviceProperty(g_deviceHandle, SCRSDK::CrDeviceProperty_PriorityKeySettings, &priorityProp) == SCRSDK::CrError_None) {
        if (priorityProp.GetCurrentValue() != SCRSDK::CrPriorityKey_PCRemote) {
            priorityProp.SetCurrentValue(SCRSDK::CrPriorityKey_PCRemote);
            SCRSDK::SetDeviceProperty(g_deviceHandle, &priorityProp);
        }
    }

    // 2. Focus lock sequence (AF / S1)
    SCRSDK::CrDeviceProperty focusModeProp;
    getDeviceProperty(g_deviceHandle, SCRSDK::CrDeviceProperty_FocusMode, &focusModeProp);
    bool isAF = (focusModeProp.GetCurrentValue() == SCRSDK::CrFocus_AF_S || focusModeProp.GetCurrentValue() == SCRSDK::CrFocus_AF_C);

    if (isAF) {
        std::promise<void> focusPromise;
        std::future<void> focusFuture = focusPromise.get_future();
        {
            std::lock_guard<std::mutex> lock(g_focusMutex);
            g_focusPromise = &focusPromise;
        }

        SCRSDK::CrDeviceProperty s1Prop;
        if (getDeviceProperty(g_deviceHandle, SCRSDK::CrDeviceProperty_S1, &s1Prop) == SCRSDK::CrError_None) {
            s1Prop.SetCurrentValue(SCRSDK::CrLockIndicator_Locked);
            SCRSDK::SetDeviceProperty(g_deviceHandle, &s1Prop);
        }

        auto fStat = focusFuture.wait_for(std::chrono::milliseconds(2500));
        {
            std::lock_guard<std::mutex> lock(g_focusMutex);
            g_focusPromise = nullptr;
        }

        SCRSDK::CrDeviceProperty fIndProp;
        getDeviceProperty(g_deviceHandle, SCRSDK::CrDeviceProperty_FocusIndication, &fIndProp);
        uint32_t lastFocusInd = static_cast<uint32_t>(fIndProp.GetCurrentValue());

        if (fStat != std::future_status::ready &&
            lastFocusInd != SCRSDK::CrFocusIndicator_Focused_AF_S &&
            lastFocusInd != SCRSDK::CrFocusIndicator_Focused_AF_C) 
        {
            std::cerr << "[FOCUS LOCK] TIMEOUT (FocusIndication: 0x" << std::hex << lastFocusInd << std::dec << ")" << std::endl;
            // Safe unlock
            if (getDeviceProperty(g_deviceHandle, SCRSDK::CrDeviceProperty_S1, &s1Prop) == SCRSDK::CrError_None) {
                s1Prop.SetCurrentValue(SCRSDK::CrLockIndicator_Unlocked);
                SCRSDK::SetDeviceProperty(g_deviceHandle, &s1Prop);
            }
            {
                std::lock_guard<std::mutex> lock(g_downloadMutex);
                g_downloadPromise = nullptr;
            }
            std::cout << "CAPTURE_FAILED:FOCUS_LOCK_TIMEOUT\n" << std::flush;
            std::cout << "CAMERA_RECOVERED_READY\n" << std::flush;
            if (wasLiveView) g_liveViewPaused = false;
            return false;
        }
    }

    // 3. Physical shutter exposure (Release Down -> 50ms -> Release Up)
    SCRSDK::SendCommand(g_deviceHandle, SCRSDK::CrCommandId_Release, SCRSDK::CrCommandParam_Down);
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    SCRSDK::SendCommand(g_deviceHandle, SCRSDK::CrCommandId_Release, SCRSDK::CrCommandParam_Up);

    // 4. Hold S1 during mirror/sensor exposure time, then unlock
    std::this_thread::sleep_for(std::chrono::milliseconds(1000));
    SCRSDK::CrDeviceProperty s1UnlockProp;
    if (getDeviceProperty(g_deviceHandle, SCRSDK::CrDeviceProperty_S1, &s1UnlockProp) == SCRSDK::CrError_None) {
        s1UnlockProp.SetCurrentValue(SCRSDK::CrLockIndicator_Unlocked);
        SCRSDK::SetDeviceProperty(g_deviceHandle, &s1UnlockProp);
    }

    // 5. Wait for download completion
    std::cerr << "[POST-DOWNLOAD] waiting for download completion (up to 25s)..." << std::endl;
    auto dlStatus = downloadFuture.wait_for(std::chrono::seconds(25));
    std::cerr << "[POST-DOWNLOAD] wait completed (ready: " 
              << (dlStatus == std::future_status::ready ? "YES" : "TIMEOUT") << ")" << std::endl;
    {
        std::lock_guard<std::mutex> lock(g_downloadMutex);
        g_downloadPromise = nullptr;
    }

    if (dlStatus != std::future_status::ready) {
        std::cerr << "[DOWNLOAD] FAILED: Timeout waiting for image download callback." << std::endl;
        std::cout << "CAPTURE_FAILED:TRANSFER_TIMEOUT\n" << std::flush;
        std::cout << "CAMERA_RECOVERED_READY\n" << std::flush;
        if (wasLiveView) g_liveViewPaused = false;
        return false;
    }

    std::string rawPath = downloadFuture.get();
    std::cerr << "[POST-DOWNLOAD] rawPath from future: " << rawPath << std::endl;

    fs::path resolvedPath = rawPath;
    std::error_code ecCheck;
    bool directExists = fs::exists(resolvedPath, ecCheck);
    std::cerr << "[POST-DOWNLOAD] source file: " << resolvedPath.string() 
              << " (direct exists: " << (directExists ? "true" : "false") << ")" << std::endl;

    if (!directExists) {
        fs::path fallbackPath = g_tetherDir / resolvedPath;
        if (fs::exists(fallbackPath, ecCheck)) {
            resolvedPath = fallbackPath;
            std::cerr << "[POST-DOWNLOAD] resolved via tetherDir: " << resolvedPath.string() << std::endl;
        }
    }

    bool fileExists = fs::exists(resolvedPath, ecCheck);
    std::cerr << "[POST-DOWNLOAD] source file exists: " << (fileExists ? "true" : "false") << std::endl;

    if (!fileExists) {
        std::cerr << "[DOWNLOAD ERROR] Transferred file does not exist on disk: " << resolvedPath.string() << std::endl;
        std::cout << "CAPTURE_FAILED:FILE_NOT_FOUND_ON_DISK\n" << std::flush;
        std::cout << "CAMERA_RECOVERED_READY\n" << std::flush;
        if (wasLiveView) g_liveViewPaused = false;
        return false;
    }

    auto fSize = fs::file_size(resolvedPath, ecCheck);
    std::cerr << "[POST-DOWNLOAD] file size: " << fSize << " bytes" << std::endl;

    // Validate JPEG bytes
    std::cerr << "[POST-DOWNLOAD] JPEG validation started" << std::endl;
    std::ifstream file(resolvedPath, std::ios::binary | std::ios::ate);
    if (file.is_open()) {
        auto tellResult = file.tellg();
        std::cerr << "[POST-DOWNLOAD] file tellg: " << tellResult << std::endl;
        if (tellResult > 0) {
            size_t actualReadSize = static_cast<size_t>(tellResult);
            file.seekg(0, std::ios::beg);
            std::vector<uint8_t> fileBytes(actualReadSize);
            file.read(reinterpret_cast<char*>(fileBytes.data()), actualReadSize);
            file.close();

            JpegInfo jpeg = ParseJpeg(fileBytes.data(), actualReadSize);
            std::cerr << "[POST-DOWNLOAD] JPEG validation completed (SOI: " 
                      << (jpeg.validSoi ? "OK" : "FAIL") << ", EOI: " 
                      << (jpeg.validEoi ? "OK" : "FAIL") << ", " 
                      << jpeg.width << "x" << jpeg.height << ")" << std::endl;
            if (!jpeg.validSoi || !jpeg.validEoi) {
                std::cerr << "[WARN] Downloaded JPEG validation failed (SOI: " << jpeg.validSoi 
                          << ", EOI: " << jpeg.validEoi << ")" << std::endl;
            }
        } else {
            file.close();
            std::cerr << "[POST-DOWNLOAD] JPEG validation skipped: non-positive tellg" << std::endl;
        }
    } else {
        std::cerr << "[POST-DOWNLOAD] JPEG validation skipped: file not open" << std::endl;
    }

    // Move / copy to destinationPath if specified
    if (!destinationPath.empty() && resolvedPath.string() != destinationPath) {
        std::cerr << "[POST-DOWNLOAD] target copy started: " << resolvedPath.string() 
                  << " -> " << destinationPath << std::endl;
        std::error_code ec;
        fs::copy_file(resolvedPath, destinationPath, fs::copy_options::overwrite_existing, ec);
        if (!ec) {
            std::cerr << "[POST-DOWNLOAD] target copy completed" << std::endl;
            outSavedPath = destinationPath;
            fs::remove(resolvedPath, ec);
        } else {
            std::cerr << "[POST-DOWNLOAD] WARNING: copy to destination failed (" 
                      << ec.message() << "), retaining source path" << std::endl;
            outSavedPath = resolvedPath.string();
        }
    } else {
        std::cerr << "[POST-DOWNLOAD] target copy skipped (same path or no destination)" << std::endl;
        outSavedPath = resolvedPath.string();
    }

    outDurationMs = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - startTime
    ).count();

    std::cerr << "[POST-DOWNLOAD] CAPTURE_SUCCESS emission (path: " << outSavedPath 
              << ", duration: " << outDurationMs << "ms)" << std::endl;
    std::cout << "CAPTURE_SUCCESS:" << outSavedPath << ":" << outDurationMs << "\n" << std::flush;

    // Verify camera recovers to READY
    std::cerr << "[POST-DOWNLOAD] recovery check started" << std::endl;
    std::this_thread::sleep_for(std::chrono::milliseconds(300));
    SCRSDK::CrDeviceProperty recProp;
    getDeviceProperty(g_deviceHandle, SCRSDK::CrDeviceProperty_RecordingState, &recProp);
    std::cerr << "[POST-DOWNLOAD] recovery check completed" << std::endl;
    std::cout << "CAMERA_RECOVERED_READY\n" << std::flush;

    if (wasLiveView) {
        std::cerr << "[POST-DOWNLOAD] live view resume started" << std::endl;
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        g_liveViewPaused = false;
        std::cout << "LIVEVIEW_RESUMED\n" << std::flush;
    }

    return true;
}

int main(int argc, char* argv[])
{
    // Determine tether directory from command line arguments or fallback to default
    if (argc > 1 && argv[1] != nullptr && argv[1][0] != '\0') {
        g_tetherDir = argv[1];
    } else {
        g_tetherDir = fs::current_path() / "test_captures";
    }

    std::error_code ec;
    fs::create_directories(g_tetherDir, ec);

    std::cerr << "[STARTUP] Initializing Sony Camera Remote SDK 2.02.00 (Windows x64)..." << std::endl;
    std::cerr << "[STARTUP] Tether directory: " << g_tetherDir.string() << std::endl;

    // STEP 1: INITIALIZE SONY SDK
    if (!SCRSDK::Init(0)) {
        std::cerr << "[FATAL] SCRSDK::Init failed!" << std::endl;
        return 1;
    }

    // STEP 2: ENUMERATE CONNECTED CAMERAS
    SCRSDK::ICrEnumCameraObjectInfo* pCameraList = nullptr;
    CrInt8u enumTimeSec = 3;
    SCRSDK::CrError enumErr = SCRSDK::EnumCameraObjects(&pCameraList, enumTimeSec);

    if (enumErr != SCRSDK::CrError_None || pCameraList == nullptr || pCameraList->GetCount() == 0) {
        std::cerr << "[FATAL] No camera detected via USB enumeration (0x" << std::hex << enumErr << std::dec << ")." << std::endl;
        if (pCameraList) pCameraList->Release();
        SCRSDK::Release();
        return 2;
    }

    SCRSDK::ICrCameraObjectInfo* targetCamInfo = nullptr;
    CrInt32u cameraCount = pCameraList->GetCount();

    for (CrInt32u i = 0; i < cameraCount; ++i) {
        const auto* camInfo = pCameraList->GetCameraObjectInfo(i);
        if (!camInfo) continue;

        std::string modelName = WCharToUtf8(camInfo->GetModel());
        std::string modelUpper = modelName;
        std::transform(modelUpper.begin(), modelUpper.end(), modelUpper.begin(), ::toupper);

        CrInt32u idSize = camInfo->GetIdSize();
        CrInt8u* idData = camInfo->GetId();
        std::string idStr = "";
        if (idData && idSize > 0) {
            char hexBuf[64] = {0};
            for (CrInt32u j = 0; j < idSize && j < 16; ++j) {
                snprintf(hexBuf + strlen(hexBuf), sizeof(hexBuf) - strlen(hexBuf), "%02X", idData[j]);
            }
            idStr = hexBuf;
        }

        if (modelUpper.find("ILCE-7CM2") != std::string::npos ||
            modelUpper.find("7CM2") != std::string::npos ||
            idStr.find("0E8C") != std::string::npos) {
            targetCamInfo = const_cast<SCRSDK::ICrCameraObjectInfo*>(camInfo);
            g_modelName = modelName;
            break;
        }
    }

    if (!targetCamInfo && cameraCount > 0) {
        targetCamInfo = const_cast<SCRSDK::ICrCameraObjectInfo*>(pCameraList->GetCameraObjectInfo(0));
        g_modelName = targetCamInfo ? WCharToUtf8(targetCamInfo->GetModel()) : "Sony Camera";
    }

    if (!targetCamInfo) {
        std::cerr << "[FATAL] Could not select camera object." << std::endl;
        pCameraList->Release();
        SCRSDK::Release();
        return 2;
    }

    std::cerr << "[CAMERA] Target Model: " << g_modelName << std::endl;

    // STEP 3: CONNECT TO CAMERA
    WindowsDeviceCallback callback;
    std::promise<void> connectPromise;
    {
        std::lock_guard<std::mutex> lock(g_promiseMutex);
        g_connectPromise = &connectPromise;
    }

    SCRSDK::CrError connErr = SCRSDK::Connect(
        targetCamInfo, 
        &callback, 
        &g_deviceHandle
    );

    if (connErr != SCRSDK::CrError_None) {
        std::cerr << "[FATAL] Connect failed with code 0x" << std::hex << connErr << std::dec << std::endl;
        {
            std::lock_guard<std::mutex> lock(g_promiseMutex);
            g_connectPromise = nullptr;
        }
        pCameraList->Release();
        SCRSDK::Release();
        return 3;
    }

    // Wait up to 5 seconds for connection handshake
    connectPromise.get_future().wait_for(std::chrono::seconds(5));
    {
        std::lock_guard<std::mutex> lock(g_promiseMutex);
        g_connectPromise = nullptr;
    }

    // Check if session already opened (0x8210) was reported from previous incomplete disconnect
    if (!g_connected.load() && (g_sessionAlreadyOpened.load() || g_lastErrorCode.load() == SCRSDK::CrError_Connect_SessionAlreadyOpened)) {
        std::cerr << "[CONNECT] CrError_Connect_SessionAlreadyOpened (0x8210) detected." << std::endl;

        // Probe if device handle is already responsive
        SCRSDK::CrDeviceProperty testProp;
        if (getDeviceProperty(g_deviceHandle, SCRSDK::CrDeviceProperty_PriorityKeySettings, &testProp) == SCRSDK::CrError_None) {
            std::cerr << "[CONNECT] Device handle is already responsive. Adopting active session." << std::endl;
            g_connected = true;
        } else {
            std::cerr << "[CONNECT] Stale session detected. Resetting camera connection..." << std::endl;
            safeDisconnect();
            std::this_thread::sleep_for(std::chrono::milliseconds(500));

            // Clean retry after stale session reset
            std::cerr << "[CONNECT] Retrying connection after session reset..." << std::endl;
            g_sessionAlreadyOpened = false;
            g_lastErrorCode = 0;
            std::promise<void> retryPromise;
            {
                std::lock_guard<std::mutex> lock(g_promiseMutex);
                g_connectPromise = &retryPromise;
            }

            connErr = SCRSDK::Connect(
                targetCamInfo, 
                &callback, 
                &g_deviceHandle
            );

            if (connErr == SCRSDK::CrError_None) {
                retryPromise.get_future().wait_for(std::chrono::seconds(5));
            }
            {
                std::lock_guard<std::mutex> lock(g_promiseMutex);
                g_connectPromise = nullptr;
            }
        }
    }

    if (!g_connected.load()) {
        std::cerr << "[FATAL] Connection timeout or failure (Error: 0x" 
                  << std::hex << g_lastErrorCode.load() << std::dec << ")." << std::endl;
        safeDisconnect();
        pCameraList->Release();
        SCRSDK::Release();
        return 4;
    }

    // STEP 4: CONFIGURE PC REMOTE PROPERTIES
    setupCameraProperties(g_deviceHandle);

    // STEP 5: CONFIGURE SETSAVEINFO
    std::wstring wCaptureDir = g_tetherDir.wstring();
    std::wstring wPrefix = L"sony_capture";
    SCRSDK::CrError saveErr = SCRSDK::SetSaveInfo(
        g_deviceHandle, 
        const_cast<wchar_t*>(wCaptureDir.c_str()), 
        const_cast<wchar_t*>(wPrefix.c_str()), 
        -1
    );
    std::cerr << "[SAVEINFO] Configured: " << WCharToUtf8(wCaptureDir.c_str()) 
              << " (0x" << std::hex << saveErr << std::dec << ")" << std::endl;

    // STEP 6: NOTIFY ELECTRON PROTOCOL
    std::cout << "CAMERA_MODEL:" << g_modelName << "\n" << std::flush;
    std::cout << "READY_FOR_SHUTTER\n" << std::flush;

    // STEP 7: STDIO COMMAND LOOP
    std::string line;
    while (std::getline(std::cin, line)) {
        // Trim leading and trailing whitespace / carriage return
        while (!line.empty() && (line.back() == ' ' || line.back() == '\r' || line.back() == '\n' || line.back() == '\t')) {
            line.pop_back();
        }
        size_t start = line.find_first_not_of(" \t\r\n");
        if (start == std::string::npos) continue;
        line = line.substr(start);

        if (line.rfind("CAPTURE", 0) == 0) {
            std::string destPath = "";
            if (line.length() > 7) {
                destPath = line.substr(7);
                while (!destPath.empty() && (destPath.front() == ' ' || destPath.front() == '\t')) {
                    destPath.erase(0, 1);
                }
                while (!destPath.empty() && (destPath.back() == ' ' || destPath.back() == '\r' || destPath.back() == '\n')) {
                    destPath.pop_back();
                }
            }
            std::string savedPath;
            int64_t durationMs = 0;
            executeSingleCapture(destPath, savedPath, durationMs);
        } else if (line == "START_LIVEVIEW" || line == "LIVEVIEW_START") {
            startLiveView();
        } else if (line == "STOP_LIVEVIEW" || line == "LIVEVIEW_STOP") {
            stopLiveView();
        } else if (line == "STATUS") {
            uint32_t batVal = 100;
            SCRSDK::CrDeviceProperty batProp;
            if (getDeviceProperty(g_deviceHandle, SCRSDK::CrDeviceProperty_BatteryLevel, &batProp) == SCRSDK::CrError_None) {
                batVal = static_cast<uint32_t>(batProp.GetCurrentValue());
            }
            uint32_t recVal = 0;
            SCRSDK::CrDeviceProperty recProp;
            if (getDeviceProperty(g_deviceHandle, SCRSDK::CrDeviceProperty_RecordingState, &recProp) == SCRSDK::CrError_None) {
                recVal = static_cast<uint32_t>(recProp.GetCurrentValue());
            }
            std::cout << "STATUS_OK:model=" << g_modelName << ":battery=" << batVal << ":recState=" << recVal << "\n" << std::flush;
        } else if (line == "QUIT" || line == "quit" || line == "q" || line == "Q") {
            break;
        }
    }

    // CLEANUP & SHUTDOWN
    std::cerr << "[CLEANUP] Stopping Live View and disconnecting camera..." << std::endl;
    stopLiveView();

    safeDisconnect();
    if (pCameraList) {
        pCameraList->Release();
    }
    SCRSDK::Release();

    std::cerr << "[CLEANUP] Clean exit" << std::endl;
    return 0;
}
