# apps/desktop/electron/native/windows/CMakeLists.txt
# CMake configuration for Sony Camera Remote SDK 2.02.00 Isolated Windows POC Runner
cmake_minimum_required(VERSION 3.15)
project(sony_camera_runner_win LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(MSVC)
    # Statically link C/C++ runtime to avoid missing MSVCP/VCRUNTIME DLL dependencies on client machines
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
    add_compile_options(/W4 /guard:cf /utf-8)
    add_compile_definitions(UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
endif()

# Directories for SDK include and lib
set(CRSDK_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/include")
set(CRSDK_LIB_DIR "${CMAKE_CURRENT_SOURCE_DIR}/lib")

if(NOT EXISTS "${CRSDK_INCLUDE_DIR}/CameraRemote_SDK.h")
    message(FATAL_ERROR "Sony Camera Remote SDK headers not found in ${CRSDK_INCLUDE_DIR}. Please ensure headers are deployed.")
endif()

include_directories(${CRSDK_INCLUDE_DIR})

add_executable(sony_camera_runner_win
    sony_camera_runner_win.cpp
)

target_link_directories(sony_camera_runner_win PRIVATE ${CRSDK_LIB_DIR})
target_link_libraries(sony_camera_runner_win PRIVATE Cr_Core)

# Post-Build: Deploy Cr_Core.dll and CrAdapter directory adjacent to executable
add_custom_command(TARGET sony_camera_runner_win POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CRSDK_LIB_DIR}/Cr_Core.dll"
        "$<TARGET_FILE_DIR:sony_camera_runner_win>/"
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${CRSDK_LIB_DIR}/CrAdapter"
        "$<TARGET_FILE_DIR:sony_camera_runner_win>/CrAdapter"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "$<TARGET_FILE:sony_camera_runner_win>"
        "$<TARGET_FILE_DIR:sony_camera_runner_win>/sony_camera_runner.exe"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "$<TARGET_FILE:sony_camera_runner_win>"
        "${CMAKE_CURRENT_SOURCE_DIR}/sony_camera_runner.exe"
    COMMENT "Deploying Sony Camera Remote SDK runtime DLLs, CrAdapter, and executable aliases..."
)
