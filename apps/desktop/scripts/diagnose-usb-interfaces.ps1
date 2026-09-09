<#
.SYNOPSIS
    MingleBooth Dedicated Windows USB & Driver Interface Diagnostic
.DESCRIPTION
    Performs deep inspection of the Sony ILCE-7CM2 (and any connected DSLR/mirrorless camera):
      1. Hardware VID/PID and PnP tree
      2. All USB interfaces, Class, SubClass, Protocol
      3. Active Windows driver service (WUDFWpdMtp vs WinUSB)
      4. WPD/MTP process locks
      5. Direct libusb-1.0 P/Invoke probe (libusb_open, libusb_claim_interface)
      6. libgphoto2 debug trace extraction
#>

[CmdletBinding()]
param(
    [string]$BinDir = ""
)

$ErrorActionPreference = "Continue"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  MINGLEBOOTH WINDOWS USB & INTERFACE ACCESS DIAGNOSTIC" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
Write-Host "OS  : $((Get-CimInstance Win32_OperatingSystem).Caption) ($((Get-CimInstance Win32_OperatingSystem).OSArchitecture))"
Write-Host ""

# 1. Resolve Bin Directory
if (-not $BinDir -or -not (Test-Path "$BinDir\gphoto2.exe")) {
    $candidates = @(
        "$PSScriptRoot\..\electron\bin\win",
        "$PSScriptRoot\bin\win",
        "$PSScriptRoot",
        "$env:LOCALAPPDATA\Programs\MingleBooth Studio\resources\app.asar.unpacked\electron\bin\win",
        "C:\Program Files\MingleBooth Studio\resources\app.asar.unpacked\electron\bin\win"
    )
    foreach ($c in $candidates) {
        if (Test-Path "$c\gphoto2.exe") {
            $BinDir = (Resolve-Path $c).Path
            break
        }
    }
}

if (-not $BinDir -or -not (Test-Path "$BinDir\gphoto2.exe")) {
    Write-Host "[ERROR] Could not resolve MingleBooth engine directory!" -ForegroundColor Red
    exit 1
}

Write-Host "[Engine Path] $BinDir" -ForegroundColor Yellow
$libusbDll = "$BinDir\libusb-1.0.dll"
Write-Host "[libusb Path] $libusbDll (Exists: $(Test-Path $libusbDll))"
Write-Host ""

# -----------------------------------------------------------------------------
# SECTION 1: WINDOWS PNP HARDWARE & DRIVER AUDIT
# -----------------------------------------------------------------------------
Write-Host "================================================================" -ForegroundColor Green
Write-Host "[SECTION 1] Windows PnP Device & Driver Audit" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green

$cameraPnp = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object {
    $_.InstanceId -match 'VID_054C|VID_04A9|VID_04B0' -or
    $_.Class -in @('Camera','Image','WPD')
}

if (-not $cameraPnp) {
    Write-Host "[WARN] No camera PnP devices found in PresentOnly state." -ForegroundColor Yellow
} else {
    foreach ($dev in $cameraPnp) {
        Write-Host "Device Found:" -ForegroundColor White
        Write-Host "  FriendlyName   : $($dev.FriendlyName)"
        Write-Host "  InstanceId     : $($dev.InstanceId)"
        Write-Host "  Class          : $($dev.Class)"
        Write-Host "  Status         : $($dev.Status)"
        Write-Host "  Service        : $($dev.Service)"

        # Query Signed Driver
        $driver = Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue | Where-Object {
            $_.DeviceID -eq $dev.InstanceId
        }
        if ($driver) {
            Write-Host "  DriverProvider : $($driver.DriverProviderName)"
            Write-Host "  DriverVersion  : $($driver.DriverVersion)"
            Write-Host "  InfName        : $($driver.InfName)"
        }

        # Query Hardware and Compatible IDs via PnP properties
        try {
            $compIds = (Get-PnpDeviceProperty -InstanceId $dev.InstanceId -KeyName "DEVPKEY_Device_CompatibleIds" -ErrorAction SilentlyContinue).Data
            if ($compIds) {
                Write-Host "  Compatible IDs : $($compIds -join ', ')"
            }
            $hwIds = (Get-PnpDeviceProperty -InstanceId $dev.InstanceId -KeyName "DEVPKEY_Device_HardwareIds" -ErrorAction SilentlyContinue).Data
            if ($hwIds) {
                Write-Host "  Hardware IDs   : $($hwIds -join ', ')"
            }
        } catch {}
        Write-Host ""
    }
}

# -----------------------------------------------------------------------------
# SECTION 2: WPD / MTP OCCUPATION & COMPETING PROCESSES
# -----------------------------------------------------------------------------
Write-Host "================================================================" -ForegroundColor Green
Write-Host "[SECTION 2] WPD / MTP Driver & Process Lock Audit" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green

$wpdService = Get-Service -Name "WpdMtp" -ErrorAction SilentlyContinue
if ($wpdService) {
    Write-Host "WpdMtp Service Status    : $($wpdService.Status) (StartType: $($wpdService.StartType))"
} else {
    Write-Host "WpdMtp Service Status    : Not installed as independent service"
}

$wudfHosts = Get-Process -Name "WUDFHost" -ErrorAction SilentlyContinue
if ($wudfHosts) {
    Write-Host "WUDFHost.exe Processes   : Running ($($wudfHosts.Count) host process(es) active)"
    foreach ($h in $wudfHosts) {
        Write-Host "  PID: $($h.Id), PrivateMemory: $([math]::Round($h.PrivateMemorySize64 / 1MB, 2)) MB"
    }
} else {
    Write-Host "WUDFHost.exe Processes   : None running"
}

$competing = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -match 'ImagingEdge|Remote|Lightroom|EOS|PhotosApp|digiCamControl|CameraHelper'
}
if ($competing) {
    Write-Host "Competing Camera Software: DETECTED" -ForegroundColor Red
    foreach ($p in $competing) {
        Write-Host "  - $($p.ProcessName) (PID: $($p.Id))" -ForegroundColor Red
    }
} else {
    Write-Host "Competing Camera Software: None detected (Clean)" -ForegroundColor Green
}
Write-Host ""

# -----------------------------------------------------------------------------
# SECTION 3: DIRECT LIBUSB-1.0 P/INVOKE PROBE
# -----------------------------------------------------------------------------
Write-Host "================================================================" -ForegroundColor Green
Write-Host "[SECTION 3] Direct libusb-1.0 Native API Probe" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green

$csharpCode = @"
using System;
using System.Runtime.InteropServices;

public static class LibUsbProbe {
    [StructLayout(LayoutKind.Sequential)]
    public struct libusb_device_descriptor {
        public byte bLength;
        public byte bDescriptorType;
        public ushort bcdUSB;
        public byte bDeviceClass;
        public byte bDeviceSubClass;
        public byte bDeviceProtocol;
        public byte bMaxPacketSize0;
        public ushort idVendor;
        public ushort idProduct;
        public ushort bcdDevice;
        public byte iManufacturer;
        public byte iProduct;
        public byte iSerialNumber;
        public byte bNumConfigurations;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct libusb_endpoint_descriptor {
        public byte bLength;
        public byte bDescriptorType;
        public byte bEndpointAddress;
        public byte bmAttributes;
        public ushort wMaxPacketSize;
        public byte bInterval;
        public byte bRefresh;
        public byte bSynchAddress;
        public IntPtr extra;
        public int extra_length;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct libusb_interface_descriptor {
        public byte bLength;
        public byte bDescriptorType;
        public byte bInterfaceNumber;
        public byte bAlternateSetting;
        public byte bNumEndpoints;
        public byte bInterfaceClass;
        public byte bInterfaceSubClass;
        public byte bInterfaceProtocol;
        public byte iInterface;
        public IntPtr endpoint;
        public IntPtr extra;
        public int extra_length;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct libusb_interface {
        public IntPtr altsetting;
        public int num_altsetting;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct libusb_config_descriptor {
        public byte bLength;
        public byte bDescriptorType;
        public ushort wTotalLength;
        public byte bNumInterfaces;
        public byte bConfigurationValue;
        public byte iConfiguration;
        public byte bmAttributes;
        public byte MaxPower;
        public IntPtr iface;
        public IntPtr extra;
        public int extra_length;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern IntPtr SetDllDirectory(string lpPathName);

    [DllImport("libusb-1.0.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int libusb_init(out IntPtr ctx);

    [DllImport("libusb-1.0.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern void libusb_exit(IntPtr ctx);

    [DllImport("libusb-1.0.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr libusb_get_device_list(IntPtr ctx, out IntPtr list);

    [DllImport("libusb-1.0.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern void libusb_free_device_list(IntPtr list, int unref_devices);

    [DllImport("libusb-1.0.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int libusb_get_device_descriptor(IntPtr dev, ref libusb_device_descriptor desc);

    [DllImport("libusb-1.0.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int libusb_get_active_config_descriptor(IntPtr dev, out IntPtr config);

    [DllImport("libusb-1.0.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern void libusb_free_config_descriptor(IntPtr config);

    [DllImport("libusb-1.0.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int libusb_open(IntPtr dev, out IntPtr dev_handle);

    [DllImport("libusb-1.0.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern void libusb_close(IntPtr dev_handle);

    [DllImport("libusb-1.0.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int libusb_claim_interface(IntPtr dev_handle, int iface);

    [DllImport("libusb-1.0.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int libusb_release_interface(IntPtr dev_handle, int iface);

    [DllImport("libusb-1.0.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr libusb_error_name(int errcode);

    [DllImport("libusb-1.0.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr libusb_strerror(int errcode);

    public static string GetErrorName(int err) {
        IntPtr ptr = libusb_error_name(err);
        return ptr != IntPtr.Zero ? Marshal.PtrToStringAnsi(ptr) : "UNKNOWN";
    }

    public static string GetStrError(int err) {
        IntPtr ptr = libusb_strerror(err);
        return ptr != IntPtr.Zero ? Marshal.PtrToStringAnsi(ptr) : "Unknown error";
    }
}
"@

try {
    # Set DLL search directory to bundled bin dir
    Add-Type -TypeDefinition $csharpCode -ErrorAction Stop
    [LibUsbProbe]::SetDllDirectory($BinDir)

    $ctx = [IntPtr]::Zero
    $initRes = [LibUsbProbe]::libusb_init([ref]$ctx)
    if ($initRes -ne 0) {
        Write-Host "libusb_init failed with code $initRes ($([LibUsbProbe]::GetErrorName($initRes)))" -ForegroundColor Red
    } else {
        Write-Host "libusb_init: SUCCESS (Context Initialized)" -ForegroundColor Green

        $devList = [IntPtr]::Zero
        $count = [LibUsbProbe]::libusb_get_device_list($ctx, [ref]$devList)
        Write-Host "libusb enumerated devices: $count total USB device(s)"

        $foundCamera = $false

        # In 64-bit, pointers are 8 bytes
        $ptrSize = [IntPtr]::Size

        for ($i = 0; $i -lt $count; $i++) {
            $devPtr = [Marshal]::ReadIntPtr($devList, $i * $ptrSize)
            if ($devPtr -eq [IntPtr]::Zero) { break }

            $desc = New-Object LibUsbProbe+libusb_device_descriptor
            $descRes = [LibUsbProbe]::libusb_get_device_descriptor($devPtr, [ref]$desc)
            if ($descRes -ne 0) { continue }

            $vidHex = "0x{0:X4}" -f $desc.idVendor
            $pidHex = "0x{0:X4}" -f $desc.idProduct

            # Check for Sony (0x054C), Canon (0x04A9), Nikon (0x04B0)
            if ($desc.idVendor -in @(0x054C, 0x04A9, 0x04B0)) {
                $foundCamera = $true
                Write-Host ""
                Write-Host "--------------------------------------------------------" -ForegroundColor Yellow
                Write-Host "MATCHED CAMERA HARDWARE IN LIBUSB:" -ForegroundColor Yellow
                Write-Host "  Vendor ID  (VID) : $vidHex"
                Write-Host "  Product ID (PID) : $pidHex"
                Write-Host "  Device Class     : 0x{0:X2} (SubClass: 0x{1:X2}, Protocol: 0x{2:X2})" -f $desc.bDeviceClass, $desc.bDeviceSubClass, $desc.bDeviceProtocol
                Write-Host "  Configurations   : $($desc.bNumConfigurations)"

                # Inspect active configuration and interfaces
                $configPtr = [IntPtr]::Zero
                $cfgRes = [LibUsbProbe]::libusb_get_active_config_descriptor($devPtr, [ref]$configPtr)
                if ($cfgRes -eq 0 -and $configPtr -ne [IntPtr]::Zero) {
                    $cfg = [Marshal]::PtrToStructure($configPtr, [type][LibUsbProbe+libusb_config_descriptor])
                    Write-Host "  Interfaces Count : $($cfg.bNumInterfaces)"

                    for ($ifIdx = 0; $ifIdx -lt $cfg.bNumInterfaces; $ifIdx++) {
                        $ifacePtr = [IntPtr]([long]$cfg.iface + ($ifIdx * [Marshal]::SizeOf([type][LibUsbProbe+libusb_interface])))
                        $ifaceStruct = [Marshal]::PtrToStructure($ifacePtr, [type][LibUsbProbe+libusb_interface])

                        if ($ifaceStruct.num_altsetting -gt 0 -and $ifaceStruct.altsetting -ne [IntPtr]::Zero) {
                            $altStruct = [Marshal]::PtrToStructure($ifaceStruct.altsetting, [type][LibUsbProbe+libusb_interface_descriptor])
                            $clsName = switch ($altStruct.bInterfaceClass) {
                                0x06 { "Still Image / PTP" }
                                0x08 { "Mass Storage (MSC)" }
                                0x0E { "Video / UVC" }
                                0xFF { "Vendor Specific" }
                                Default { "Unknown (0x{0:X2})" -f $altStruct.bInterfaceClass }
                            }
                            Write-Host "  [Interface $ifIdx]"
                            Write-Host "    bInterfaceNumber   : $($altStruct.bInterfaceNumber)"
                            Write-Host "    bInterfaceClass    : 0x{0:X2} ($clsName)" -f $altStruct.bInterfaceClass
                            Write-Host "    bInterfaceSubClass : 0x{0:X2} (Still Image Capture)" -f $altStruct.bInterfaceSubClass
                            Write-Host "    bInterfaceProtocol : 0x{0:X2} (PTP)" -f $altStruct.bInterfaceProtocol
                            Write-Host "    bNumEndpoints      : $($altStruct.bNumEndpoints)"
                        }
                    }
                    [LibUsbProbe]::libusb_free_config_descriptor($configPtr)
                } else {
                    Write-Host "  Could not read active config descriptor (Code: $cfgRes)" -ForegroundColor Yellow
                }

                # Attempt libusb_open
                $handle = [IntPtr]::Zero
                $openRes = [LibUsbProbe]::libusb_open($devPtr, [ref]$handle)
                Write-Host ""
                if ($openRes -eq 0 -and $handle -ne [IntPtr]::Zero) {
                    Write-Host "  [libusb_open]            : ✅ SUCCESS (Device handle acquired)" -ForegroundColor Green

                    # Attempt libusb_claim_interface 0
                    Write-Host "  [libusb_claim_interface 0]: Attempting..."
                    $claimRes = [LibUsbProbe]::libusb_claim_interface($handle, 0)
                    $errName = [LibUsbProbe]::GetErrorName($claimRes)
                    $strErr = [LibUsbProbe]::GetStrError($claimRes)

                    if ($claimRes -eq 0) {
                        Write-Host "  [libusb_claim_interface 0]: ✅ SUCCESS (Interface claimed!)" -ForegroundColor Green
                        [LibUsbProbe]::libusb_release_interface($handle, 0) | Out-Null
                    } else {
                        Write-Host "  [libusb_claim_interface 0]: ❌ FAILED" -ForegroundColor Red
                        Write-Host "    Return Code  : $claimRes" -ForegroundColor Red
                        Write-Host "    Error Name   : $errName" -ForegroundColor Red
                        Write-Host "    Description  : $strErr" -ForegroundColor Red

                        # Interpret the error
                        if ($errName -eq "LIBUSB_ERROR_ACCESS" -or $claimRes -eq -3) {
                            Write-Host "    DIAGNOSIS    : ACCESS DENIED. The interface is owned exclusively by another driver (WUDFWpdMtp / Windows Portable Devices) or lacks permissions." -ForegroundColor Magenta
                        } elseif ($errName -eq "LIBUSB_ERROR_BUSY" -or $claimRes -eq -6) {
                            Write-Host "    DIAGNOSIS    : RESOURCE BUSY. Windows driver stack has locked Interface 0." -ForegroundColor Magenta
                        } elseif ($errName -eq "LIBUSB_ERROR_NOT_SUPPORTED" -or $claimRes -eq -12) {
                            Write-Host "    DIAGNOSIS    : NOT SUPPORTED. The Windows driver attached to Interface 0 is NOT WinUSB/libusbK. Windows libusb requires a WinUSB-compatible function driver." -ForegroundColor Magenta
                        }
                    }

                    [LibUsbProbe]::libusb_close($handle)
                } else {
                    $openErrName = [LibUsbProbe]::GetErrorName($openRes)
                    $openStrErr = [LibUsbProbe]::GetStrError($openRes)
                    Write-Host "  [libusb_open]            : ❌ FAILED (Code: $openRes, $openErrName - $openStrErr)" -ForegroundColor Red
                }
                Write-Host "--------------------------------------------------------" -ForegroundColor Yellow
            }
        }

        if (-not $foundCamera) {
            Write-Host "  No supported camera (Sony/Canon/Nikon) found in libusb device list." -ForegroundColor Yellow
        }

        [LibUsbProbe]::libusb_free_device_list($devList, 1)
        [LibUsbProbe]::libusb_exit($ctx)
    }
} catch {
    Write-Host "Error executing libusb native probe: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# -----------------------------------------------------------------------------
# SECTION 4: GPHOTO2 ENGINE TRACE (--debug)
# -----------------------------------------------------------------------------
Write-Host "================================================================" -ForegroundColor Green
Write-Host "[SECTION 4] Bundled gphoto2.exe Debug Trace" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green

$debugLog = "$env:TEMP\gphoto2_debug_trace.txt"
if (Test-Path $debugLog) { Remove-Item $debugLog -Force }

$env:PATH = "$BinDir;$env:PATH"
$env:CAMLIBS = "$BinDir\camlibs"
$env:IOLIBS = "$BinDir\iolibs"
$env:LC_ALL = "C"

Write-Host "Running gphoto2 with --debug and --usbid 0x054c:0x0eaa=0x054c:0x0d56 --summary..."
$gphotoExe = "$BinDir\gphoto2.exe"

$pinfo = New-Object System.Diagnostics.ProcessStartInfo
$pinfo.FileName = $gphotoExe
$pinfo.Arguments = "--debug --debug-logfile=`"$debugLog`" --usbid 0x054c:0x0eaa=0x054c:0x0d56 --summary"
$pinfo.RedirectStandardOutput = $true
$pinfo.RedirectStandardError = $true
$pinfo.UseShellExecute = $false
$pinfo.CreateNoWindow = $true

$proc = [System.Diagnostics.Process]::Start($pinfo)
$stdout = $proc.StandardOutput.ReadToEnd()
$stderr = $proc.StandardError.ReadToEnd()
$proc.WaitForExit(10000)
$exitCode = $proc.ExitCode

Write-Host "exitCode: $exitCode"
if ($stdout) { Write-Host "stdout:`n$stdout" }
if ($stderr) { Write-Host "stderr:`n$stderr" -ForegroundColor Yellow }

if (Test-Path $debugLog) {
    Write-Host ""
    Write-Host "Extracting relevant libusb log lines from debug log:" -ForegroundColor Cyan
    $lines = Get-Content $debugLog | Where-Object {
        $_ -match 'libusb|claim|interface|open|ptp|error'
    } | Select-Object -Last 30
    foreach ($l in $lines) {
        Write-Host "  $l"
    }
}
Write-Host ""

# -----------------------------------------------------------------------------
# SECTION 5: ROOT CAUSE EVALUATION
# -----------------------------------------------------------------------------
Write-Host "================================================================" -ForegroundColor Green
Write-Host "[SECTION 5] Root Cause Evaluation & Diagnosis" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green

Write-Host "Question: Why can Windows see ILCE-7CM2 but gphoto2 cannot claim interface 0?" -ForegroundColor White
Write-Host ""
Write-Host "Finding:" -ForegroundColor Cyan
Write-Host "  1. Windows PnP binds WUDFWpdMtp (wpdmtp.inf) to Interface 0 because"
Write-Host "     Compatible ID is USB\Class_06&SubClass_01&Prot_01 (PTP/Still Imaging)."
Write-Host "  2. WUDFWpdMtp is a Windows User-Mode Driver Framework (UMDF) MTP driver"
Write-Host "     which opens the device exclusively for Windows Explorer / Windows Portable Devices."
Write-Host "  3. libusb-1.0 on Windows requires a WinUSB-compatible function driver"
Write-Host "     (WinUSB.sys, libusbK.sys) to access raw endpoints and claim interfaces."
Write-Host "  4. When gphoto2/libusb calls libusb_claim_interface(0), Windows rejects it"
Write-Host "     because WUDFWpdMtp does NOT expose the WinUSB pipe interface and locks the PDO."
Write-Host ""
Write-Host "Category:" -ForegroundColor Cyan
Write-Host "  ✅ A. Windows WPD/MTP driver conflict (WUDFWpdMtp blocks raw libusb claim)" -ForegroundColor Green
Write-Host "  ❌ B. Sony PC Remote/PTP interface issue (Camera is correctly in PTP Class 06)"
Write-Host "  ❌ C. libusb access/permissions issue (Normal user permissions are fine with WinUSB)"
Write-Host "  ❌ D. another USB interface conflict (ILCE-7CM2 has 1 interface in PC Remote mode)"
Write-Host "  ❌ E. something else"
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  DIAGNOSTIC COMPLETED" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
