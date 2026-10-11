// apps/desktop/electron/native/sony_camera_runner.cpp
// Sony Camera Remote SDK 2.02.00 Production Runner for MingleBooth (macOS)
// Strictly scoped to physically verified model: Sony ILCE-7CM2 (α7C II)

#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <future>
#include <iostream>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
#include <filesystem>
#include <algorithm>
#include <atomic>

#if defined(__APPLE__) || defined(__linux__)
  #include <unistd.h>
#endif

#include "CameraRemote_SDK.h"
#include "CrDeviceProperty.h"
#include "IDeviceCallback.h"
#include "CrDebugString.h"

namespace fs = std::filesystem;

static bool m_connected = false;
static std::string m_modelName = "";
static int64_t m_device_handle = 0;

static std::mutex m_eventPromiseMutex;
static std::promise<void>* m_eventPromise = nullptr;

static std::mutex m_focusPromiseMutex;
static std::promise<void>* m_focusPromise = nullptr;

static std::mutex m_downloadPromiseMutex;
static std::promise<std::string>* m_downloadPromise = nullptr;

// Live View state & worker thread
static std::atomic<bool> m_liveViewRunning{false};
static std::atomic<bool> m_liveViewPaused{false};
static std::thread m_liveViewThread;

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

void liveViewWorker()
{
    SCRSDK::CrImageInfo info;
    SCRSDK::CrError err = SCRSDK::GetLiveViewImageInfo(m_device_handle, &info);
    CrInt32u bufSize = info.GetBufferSize();
    if (bufSize <= 0) bufSize = 512 * 1024;
    std::vector<CrInt8u> buffer(bufSize);
    SCRSDK::CrImageDataBlock imageData;

    while (m_liveViewRunning.load()) {
        if (m_liveViewPaused.load()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(20));
            continue;
        }

        imageData.SetSize((CrInt32u)buffer.size());
        imageData.SetData(buffer.data());

        err = SCRSDK::GetLiveViewImage(m_device_handle, &imageData);
        if (err == SCRSDK::CrError_None) {
            uint32_t imgSize = imageData.GetImageSize();
            if (imgSize > 2) {
                const uint8_t* p = (const uint8_t*)imageData.GetImageData();
                if (p[0] == 0xFF && p[1] == 0xD8) {
                    std::string b64 = base64_encode(p, imgSize);
                    std::cout << "LV_FRAME:" << b64 << "\n" << std::flush;
                }
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(30)); // ~25 FPS
        } else if (err == SCRSDK::CrWarning_Frame_NotUpdated) {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        } else {
            std::this_thread::sleep_for(std::chrono::milliseconds(25));
        }
    }
}

void startLiveView()
{
    if (m_liveViewRunning.load()) {
        if (m_liveViewPaused.load()) {
            m_liveViewPaused = false;
            std::cout << "LIVEVIEW_RESUMED\n" << std::flush;
        }
        return;
    }
    m_liveViewRunning = true;
    m_liveViewPaused = false;
    m_liveViewThread = std::thread(liveViewWorker);
    std::cout << "LIVEVIEW_STARTED\n" << std::flush;
}

void stopLiveView()
{
    if (!m_liveViewRunning.load()) return;
    m_liveViewRunning = false;
    if (m_liveViewThread.joinable()) {
        m_liveViewThread.join();
    }
    std::cout << "LIVEVIEW_STOPPED\n" << std::flush;
}

void setEventPromise(std::promise<void>* dp)
{
    std::lock_guard<std::mutex> lock(m_eventPromiseMutex);
    m_eventPromise = dp;
}

void setFocusPromise(std::promise<void>* dp)
{
    std::lock_guard<std::mutex> lock(m_focusPromiseMutex);
    m_focusPromise = dp;
}

void setDownloadPromise(std::promise<std::string>* dp)
{
    std::lock_guard<std::mutex> lock(m_downloadPromiseMutex);
    m_downloadPromise = dp;
}

static SCRSDK::CrError getDeviceProperty(int64_t handle, uint32_t code, SCRSDK::CrDeviceProperty* outProp)
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

class DeviceCallback : public SCRSDK::IDeviceCallback
{
public:
    DeviceCallback() {}
    ~DeviceCallback() {}

    void OnConnected(SCRSDK::DeviceConnectionVersioin version) override
    {
        m_connected = true;
        std::cout << "[SDK Callback] OnConnected (Version: " << version << ")\n" << std::flush;
        std::lock_guard<std::mutex> lock(m_eventPromiseMutex);
        if (m_eventPromise) {
            m_eventPromise->set_value();
            m_eventPromise = nullptr;
        }
    }

    void OnError(CrInt32u error) override
    {
        std::cerr << "[SDK Callback] OnError: Code 0x" << std::hex << error << std::dec << " (" << CrErrorString(error) << ")\n" << std::flush;
        std::lock_guard<std::mutex> lock(m_eventPromiseMutex);
        if (m_eventPromise) {
            m_eventPromise->set_exception(std::make_exception_ptr(std::runtime_error("Connection Error")));
            m_eventPromise = nullptr;
        }
    }

    void OnDisconnected(CrInt32u error) override
    {
        std::cout << "[SDK Callback] OnDisconnected: Device disconnected\n" << std::flush;
        m_connected = false;
        m_liveViewRunning = false;
        std::lock_guard<std::mutex> lock(m_eventPromiseMutex);
        if (m_eventPromise) {
            m_eventPromise->set_value();
            m_eventPromise = nullptr;
        }
    }

    void OnCompleteDownload(CrChar* filename, CrInt32u type) override
    {
        std::string path(filename ? filename : "");
        std::cout << "[SDK Callback] OnCompleteDownload: " << path << "\n" << std::flush;
        std::lock_guard<std::mutex> lock(m_downloadPromiseMutex);
        if (m_downloadPromise) {
            m_downloadPromise->set_value(path);
            m_downloadPromise = nullptr;
        }
    }

    void OnNotifyContentsTransfer(CrInt32u notify, SCRSDK::CrContentHandle contentHandle, CrChar* filename) override
    {
        std::cout << "[SDK Callback] OnNotifyContentsTransfer: " << (filename ? filename : "") << "\n" << std::flush;
    }

    void OnNotifyRemoteTransferResult(CrInt32u notify, CrInt32u per, CrChar* filename) override
    {
        std::string fn(filename ? filename : "");
        std::cout << "[SDK Callback] OnNotifyRemoteTransferResult: " << fn << " (notify: 0x" << std::hex << notify << std::dec << ")\n" << std::flush;
        if (notify == SCRSDK::CrNotify_RemoteTransfer_Result_OK && !fn.empty()) {
            std::lock_guard<std::mutex> lock(m_downloadPromiseMutex);
            if (m_downloadPromise) {
                m_downloadPromise->set_value(fn);
                m_downloadPromise = nullptr;
            }
        }
    }

    void OnPropertyChangedCodes(CrInt32u num, CrInt32u* codes) override
    {
        for (uint32_t i = 0; i < num; ++i) {
            if (codes[i] == SCRSDK::CrDeviceProperty_FocusIndication) {
                SCRSDK::CrDeviceProperty devProp;
                if (getDeviceProperty(m_device_handle, codes[i], &devProp) == SCRSDK::CrError_None) {
                    uint32_t val = (uint32_t)devProp.GetCurrentValue();
                    std::cout << "[SDK Callback] FocusIndication: 0x" << std::hex << val << std::dec << "\n" << std::flush;
                    if (val == SCRSDK::CrFocusIndicator_Focused_AF_S || val == SCRSDK::CrFocusIndicator_Focused_AF_C) {
                        std::lock_guard<std::mutex> lock(m_focusPromiseMutex);
                        if (m_focusPromise) {
                            m_focusPromise->set_value();
                            m_focusPromise = nullptr;
                        }
                    }
                }
            }
        }
    }

    void OnWarning(CrInt32u warning) override {}
    void OnWarningExt(CrInt32u warning, CrInt32 param1, CrInt32 param2, CrInt32 param3) override {}
    void OnLvPropertyChanged() override {}
    void OnLvPropertyChangedCodes(CrInt32u num, CrInt32u* codes) override {}
    void OnPropertyChanged() override {}
};

static void setupCameraProperties(int64_t handle)
{
    // 1. Set PriorityKeySettings to PC Remote (0x0002)
    SCRSDK::CrDeviceProperty priorityProp;
    if (getDeviceProperty(handle, SCRSDK::CrDeviceProperty_PriorityKeySettings, &priorityProp) == SCRSDK::CrError_None) {
        if (priorityProp.GetCurrentValue() != SCRSDK::CrPriorityKey_PCRemote) {
            priorityProp.SetCurrentValue(SCRSDK::CrPriorityKey_PCRemote);
            SCRSDK::SetDeviceProperty(handle, &priorityProp);
        }
    }

    // 2. Set StillImageStoreDestination to HostPCAndMemoryCard (0x0003)
    SCRSDK::CrDeviceProperty destProp;
    if (getDeviceProperty(handle, SCRSDK::CrDeviceProperty_StillImageStoreDestination, &destProp) == SCRSDK::CrError_None) {
        if (destProp.GetCurrentValue() != SCRSDK::CrStillImageStoreDestination_HostPCAndMemoryCard) {
            destProp.SetCurrentValue(SCRSDK::CrStillImageStoreDestination_HostPCAndMemoryCard);
            SCRSDK::SetDeviceProperty(handle, &destProp);
        }
    }

    // 3. Set Still_Image_Trans_Size to Original (0x0000)
    SCRSDK::CrDeviceProperty sizeProp;
    if (getDeviceProperty(handle, SCRSDK::CrDeviceProperty_Still_Image_Trans_Size, &sizeProp) == SCRSDK::CrError_None) {
        if (sizeProp.GetCurrentValue() != SCRSDK::CrPropertyStillImageTransSize_Original) {
            sizeProp.SetCurrentValue(SCRSDK::CrPropertyStillImageTransSize_Original);
            SCRSDK::SetDeviceProperty(handle, &sizeProp);
        }
    }
}

// Single capture routine
bool executeSingleCapture(const std::string& destinationPath, std::string& outSavedPath, int64_t& outDurationMs)
{
    bool wasLiveView = m_liveViewRunning.load();
    if (wasLiveView) {
        m_liveViewPaused = true;
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }

    auto startTime = std::chrono::steady_clock::now();
    std::cout << "[SonyRunner] CAPTURE_START\n" << std::flush;

    std::promise<std::string> downloadPromise;
    std::future<std::string> downloadFuture = downloadPromise.get_future();
    setDownloadPromise(&downloadPromise);

    // 1. PriorityKey check
    SCRSDK::CrDeviceProperty priorityProp;
    getDeviceProperty(m_device_handle, SCRSDK::CrDeviceProperty_PriorityKeySettings, &priorityProp);
    if (priorityProp.GetCurrentValue() != SCRSDK::CrPriorityKey_PCRemote) {
        priorityProp.SetCurrentValue(SCRSDK::CrPriorityKey_PCRemote);
        SCRSDK::SetDeviceProperty(m_device_handle, &priorityProp);
    }

    // 2. AF Lock if in AF mode
    SCRSDK::CrDeviceProperty focusModeProp;
    getDeviceProperty(m_device_handle, SCRSDK::CrDeviceProperty_FocusMode, &focusModeProp);
    bool isAF = (focusModeProp.GetCurrentValue() == SCRSDK::CrFocus_AF_S || focusModeProp.GetCurrentValue() == SCRSDK::CrFocus_AF_C);

    if (isAF) {
        std::promise<void> focusPromise;
        std::future<void> focusFuture = focusPromise.get_future();
        setFocusPromise(&focusPromise);

        SCRSDK::CrDeviceProperty s1Prop;
        if (getDeviceProperty(m_device_handle, SCRSDK::CrDeviceProperty_S1, &s1Prop) == SCRSDK::CrError_None) {
            s1Prop.SetCurrentValue(SCRSDK::CrLockIndicator_Locked);
            SCRSDK::SetDeviceProperty(m_device_handle, &s1Prop);
        }

        std::future_status fStat = focusFuture.wait_for(std::chrono::milliseconds(2000));
        SCRSDK::CrDeviceProperty fIndProp;
        getDeviceProperty(m_device_handle, SCRSDK::CrDeviceProperty_FocusIndication, &fIndProp);
        uint32_t lastFocusInd = (uint32_t)fIndProp.GetCurrentValue();

        if (fStat == std::future_status::ready) {
            std::cout << "[SonyRunner] FOCUS_LOCKED (0x" << std::hex << lastFocusInd << std::dec << ")\n" << std::flush;
        } else {
            std::cout << "[SonyRunner] FOCUS_WAIT_TIMEOUT (0x" << std::hex << lastFocusInd << std::dec << ")\n" << std::flush;
        }
        setFocusPromise(nullptr);
    }

    // 3. Release Down
    SCRSDK::SendCommand(m_device_handle, SCRSDK::CrCommandId_Release, SCRSDK::CrCommandParam_Down);
    std::this_thread::sleep_for(std::chrono::milliseconds(50));

    // 4. Release Up
    SCRSDK::SendCommand(m_device_handle, SCRSDK::CrCommandId_Release, SCRSDK::CrCommandParam_Up);
    std::cout << "[SonyRunner] PHYSICAL_EXPOSURE_COMPLETED\n" << std::flush;

    // 5. Hold S1 during exposure, then unlock S1
    std::this_thread::sleep_for(std::chrono::milliseconds(1000));
    SCRSDK::CrDeviceProperty s1UnlockProp;
    if (getDeviceProperty(m_device_handle, SCRSDK::CrDeviceProperty_S1, &s1UnlockProp) == SCRSDK::CrError_None) {
        s1UnlockProp.SetCurrentValue(SCRSDK::CrLockIndicator_Unlocked);
        SCRSDK::SetDeviceProperty(m_device_handle, &s1UnlockProp);
    }

    // 6. Image transfer
    std::cout << "[SonyRunner] WAITING_FOR_IMAGE_TRANSFER\n" << std::flush;
    std::future_status dlStatus = downloadFuture.wait_for(std::chrono::seconds(25));
    if (dlStatus == std::future_status::ready) {
        std::string rawPath = downloadFuture.get();
        auto totalMs = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - startTime).count();
        outDurationMs = totalMs;

        // If a specific destination path was requested, copy/move the raw file to destinationPath
        if (!destinationPath.empty() && rawPath != destinationPath) {
            try {
                fs::copy_file(rawPath, destinationPath, fs::copy_options::overwrite_existing);
                outSavedPath = destinationPath;
            } catch (const std::exception& e) {
                std::cerr << "[SonyRunner] File copy error: " << e.what() << "\n" << std::flush;
                outSavedPath = rawPath;
            }
        } else {
            outSavedPath = rawPath;
        }

        std::cout << "[SonyRunner] IMAGE_TRANSFER_COMPLETE: " << outSavedPath << "\n" << std::flush;
        if (wasLiveView) {
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
            m_liveViewPaused = false;
            std::cout << "LIVEVIEW_RESUMED\n" << std::flush;
        }
        return true;
    } else {
        std::cerr << "[SonyRunner] IMAGE_TRANSFER_TIMEOUT\n" << std::flush;
        if (wasLiveView) {
            m_liveViewPaused = false;
        }
        return false;
    }
}

int main(int argc, char* argv[])
{
    std::string saveDir = "/tmp";
    if (argc > 1) {
        saveDir = argv[1];
    }
    fs::create_directories(saveDir);

    std::cout << "INIT_START\n" << std::flush;

    if (!SCRSDK::Init()) {
        std::cerr << "INIT_FAILED\n" << std::flush;
        return 1;
    }
    std::cout << "INIT_OK\n" << std::flush;

    SCRSDK::ICrEnumCameraObjectInfo* enumInfo = nullptr;
    SCRSDK::CrError enumErr = SCRSDK::EnumCameraObjects(&enumInfo, 3);
    if (enumErr != SCRSDK::CrError_None || !enumInfo || enumInfo->GetCount() == 0) {
        std::cerr << "ENUM_NO_CAMERA\n" << std::flush;
        if (enumInfo) enumInfo->Release();
        SCRSDK::Release();
        return 2;
    }

    auto* objInfo = enumInfo->GetCameraObjectInfo(0);
    m_modelName = objInfo->GetModel();
    std::cout << "CAMERA_MODEL:" << m_modelName << "\n" << std::flush;

    // Strict model check: Verify model is ILCE-7CM2
    std::string modelUpper = m_modelName;
    std::transform(modelUpper.begin(), modelUpper.end(), modelUpper.begin(), ::toupper);
    if (modelUpper.find("ILCE-7CM2") == std::string::npos && modelUpper.find("7CM2") == std::string::npos) {
        std::cerr << "UNSUPPORTED_MODEL:" << m_modelName << "\n" << std::flush;
        enumInfo->Release();
        SCRSDK::Release();
        return 5;
    }

    DeviceCallback callback;
    std::promise<void> connectPromise;
    std::future<void> connectFuture = connectPromise.get_future();
    setEventPromise(&connectPromise);

    SCRSDK::CrError connErr = SCRSDK::Connect(
        const_cast<SCRSDK::ICrCameraObjectInfo*>(objInfo),
        &callback,
        &m_device_handle,
        SCRSDK::CrSdkControlMode_Remote,
        SCRSDK::CrReconnecting_ON,
        "", "", "", 0
    );

    if (connErr != SCRSDK::CrError_None) {
        std::cerr << "CONNECT_FAILED:0x" << std::hex << connErr << std::dec << "\n" << std::flush;
        enumInfo->Release();
        SCRSDK::Release();
        return 3;
    }

    std::future_status waitStatus = connectFuture.wait_for(std::chrono::seconds(5));
    if (waitStatus != std::future_status::ready) {
        std::cerr << "CONNECT_TIMEOUT\n" << std::flush;
        SCRSDK::ReleaseDevice(m_device_handle);
        enumInfo->Release();
        SCRSDK::Release();
        return 4;
    }

    std::cout << "CONNECT_OK\n" << std::flush;

    // Set save folder
    std::string prefix = "sony_capture";
    SCRSDK::CrError saveErr = SCRSDK::SetSaveInfo(m_device_handle, const_cast<char*>(saveDir.c_str()), const_cast<char*>(prefix.c_str()), -1);
    std::cout << "SAVE_INFO_SET:" << (saveErr == SCRSDK::CrError_None ? "OK" : "ERR") << "\n" << std::flush;

    // Apply official Sony property setup
    setupCameraProperties(m_device_handle);

    std::cout << "READY_FOR_SHUTTER\n" << std::flush;

    // Listen on stdin for commands:
    //   CAPTURE [target_path]
    //   STATUS
    //   QUIT
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.rfind("CAPTURE", 0) == 0) {
            std::string destPath = "";
            if (line.length() > 8) {
                destPath = line.substr(8);
                // trim whitespace
                while (!destPath.empty() && (destPath.back() == ' ' || destPath.back() == '\r' || destPath.back() == '\n')) {
                    destPath.pop_back();
                }
            }

            std::string savedPath;
            int64_t durationMs = 0;
            bool ok = executeSingleCapture(destPath, savedPath, durationMs);

            if (ok) {
                // Verify camera recovers to READY
                std::this_thread::sleep_for(std::chrono::milliseconds(500));
                SCRSDK::CrDeviceProperty recProp;
                getDeviceProperty(m_device_handle, SCRSDK::CrDeviceProperty_RecordingState, &recProp);
                std::cout << "CAPTURE_SUCCESS:" << savedPath << ":" << durationMs << "\n" << std::flush;
                std::cout << "CAMERA_RECOVERED_READY (RecState: 0x" << std::hex << recProp.GetCurrentValue() << std::dec << ")\n" << std::flush;
            } else {
                std::cout << "CAPTURE_FAILED:TRANSFER_TIMEOUT\n" << std::flush;
            }
        } else if (line == "START_LIVEVIEW" || line == "LIVEVIEW_START") {
            startLiveView();
        } else if (line == "STOP_LIVEVIEW" || line == "LIVEVIEW_STOP") {
            stopLiveView();
        } else if (line == "STATUS") {
            SCRSDK::CrDeviceProperty batProp;
            uint32_t batVal = 100;
            if (getDeviceProperty(m_device_handle, SCRSDK::CrDeviceProperty_BatteryLevel, &batProp) == SCRSDK::CrError_None) {
                batVal = (uint32_t)batProp.GetCurrentValue();
            }
            SCRSDK::CrDeviceProperty recProp;
            uint32_t recVal = 0;
            if (getDeviceProperty(m_device_handle, SCRSDK::CrDeviceProperty_RecordingState, &recProp) == SCRSDK::CrError_None) {
                recVal = (uint32_t)recProp.GetCurrentValue();
            }
            std::cout << "STATUS_OK:model=" << m_modelName << ":battery=" << batVal << ":recState=" << recVal << "\n" << std::flush;
        } else if (line == "QUIT" || line == "q" || line == "Q") {
            break;
        }
    }

    std::cout << "CLEANUP\n" << std::flush;
    stopLiveView();
    if (m_connected) {
        std::promise<void> disconnectPromise;
        std::future<void> disconnectFuture = disconnectPromise.get_future();
        setEventPromise(&disconnectPromise);
        SCRSDK::Disconnect(m_device_handle);
        disconnectFuture.wait_for(std::chrono::seconds(2));
    }

    if (m_device_handle) SCRSDK::ReleaseDevice(m_device_handle);
    if (enumInfo) enumInfo->Release();
    SCRSDK::Release();

    std::cout << "EXIT_OK\n" << std::flush;
    return 0;
}
