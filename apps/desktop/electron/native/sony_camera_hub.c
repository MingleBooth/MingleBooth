#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <fcntl.h>
#include <time.h>
#include <sys/time.h>
#include <sys/stat.h>
#include <gphoto2/gphoto2-camera.h>
#include <gphoto2/gphoto2-context.h>
#include <gphoto2/gphoto2-file.h>

static volatile sig_atomic_t g_running = 1;
static volatile sig_atomic_t g_trigger_capture = 0;

static void handle_sigterm(int sig) {
    (void)sig;
    g_running = 0;
}

static void handle_sigusr1(int sig) {
    (void)sig;
    g_trigger_capture = 1;
}

static void generate_filename(const char *dest_dir, const char *orig_name, char *out_path, size_t max_len) {
    time_t now = time(NULL);
    struct tm tm_info;
    localtime_r(&now, &tm_info);
    static int counter = 1;

    const char *ext = strrchr(orig_name, '.');
    if (!ext || strlen(ext) > 5) {
        ext = ".jpg";
    }

    snprintf(out_path, max_len, "%s/sony_%04d%02d%02d_%02d%02d%02d_%04d%s",
             dest_dir,
             tm_info.tm_year + 1900,
             tm_info.tm_mon + 1,
             tm_info.tm_mday,
             tm_info.tm_hour,
             tm_info.tm_min,
             tm_info.tm_sec,
             counter++,
             ext);
}

int main(int argc, char **argv) {
    const char *dest_dir = "./data/tether-inbox";
    if (argc > 1 && argv[1][0]) {
        dest_dir = argv[1];
    }

    struct stat st;
    if (stat(dest_dir, &st) != 0) {
        mkdir(dest_dir, 0755);
    }

    signal(SIGINT, handle_sigterm);
    signal(SIGTERM, handle_sigterm);
    signal(SIGUSR1, handle_sigusr1);

    // Set stdin non-blocking to receive commands
    int flags = fcntl(STDIN_FILENO, F_GETFL, 0);
    fcntl(STDIN_FILENO, F_SETFL, flags | O_NONBLOCK);

    GPContext *context = gp_context_new();
    Camera *camera = NULL;

    fprintf(stderr, "STATUS:CONNECTING\n");
    fflush(stderr);

    int ret = gp_camera_new(&camera);
    if (ret != GP_OK) {
        fprintf(stderr, "STATUS:ERROR:Failed to allocate camera (%d)\n", ret);
        fflush(stderr);
        gp_context_unref(context);
        return 1;
    }

    ret = gp_camera_init(camera, context);
    if (ret != GP_OK) {
        fprintf(stderr, "STATUS:ERROR:PTP connection handshake failed (%d)\n", ret);
        fflush(stderr);
        gp_camera_free(camera);
        gp_context_unref(context);
        return 1;
    }

    CameraAbilities abilities;
    memset(&abilities, 0, sizeof(abilities));
    gp_camera_get_abilities(camera, &abilities);

    const char *model_name = abilities.model[0] ? abilities.model : "Sony Digital Camera";
    fprintf(stderr, "STATUS:READY:%s\n", model_name);
    fflush(stderr);

    int preview_enabled = 1;
    int consecutive_preview_errors = 0;
    char stdin_buf[256];

    while (g_running) {
        // 1. Check commands on stdin (CAPTURE, PAUSE_PREVIEW, RESUME_PREVIEW, QUIT)
        ssize_t n = read(STDIN_FILENO, stdin_buf, sizeof(stdin_buf) - 1);
        if (n > 0) {
            stdin_buf[n] = '\0';
            if (strstr(stdin_buf, "CAPTURE")) {
                g_trigger_capture = 1;
            } else if (strstr(stdin_buf, "PAUSE_PREVIEW")) {
                preview_enabled = 0;
            } else if (strstr(stdin_buf, "RESUME_PREVIEW")) {
                preview_enabled = 1;
            } else if (strstr(stdin_buf, "QUIT")) {
                g_running = 0;
                break;
            }
        }

        // 2. Handle UI Capture Trigger
        if (g_trigger_capture) {
            g_trigger_capture = 0;
            fprintf(stderr, "STATUS:CAPTURING\n");
            fflush(stderr);

            CameraFilePath target_path;
            memset(&target_path, 0, sizeof(target_path));
            ret = gp_camera_capture(camera, GP_CAPTURE_IMAGE, &target_path, context);
            if (ret == GP_OK) {
                char full_path[512];
                generate_filename(dest_dir, target_path.name, full_path, sizeof(full_path));

                CameraFile *photo_file = NULL;
                gp_file_new(&photo_file);
                ret = gp_camera_file_get(camera, target_path.folder, target_path.name, GP_FILE_TYPE_NORMAL, photo_file, context);
                if (ret == GP_OK) {
                    gp_file_save(photo_file, full_path);
                    fprintf(stderr, "PHOTO:CAPTURED:%s\n", full_path);
                    fflush(stderr);
                } else {
                    fprintf(stderr, "STATUS:DOWNLOAD_ERROR:%d\n", ret);
                    fflush(stderr);
                }
                gp_file_free(photo_file);
            } else {
                fprintf(stderr, "STATUS:CAPTURE_ERROR:%d\n", ret);
                fflush(stderr);
            }
            fprintf(stderr, "STATUS:READY:%s\n", model_name);
            fflush(stderr);
        }

        // 3. Live View: capture preview frame from camera sensor
        if (preview_enabled && g_running) {
            CameraFile *preview_file = NULL;
            gp_file_new(&preview_file);
            ret = gp_camera_capture_preview(camera, preview_file, context);
            if (ret == GP_OK) {
                consecutive_preview_errors = 0;
                const char *data = NULL;
                unsigned long size = 0;
                gp_file_get_data_and_size(preview_file, &data, &size);
                if (data && size > 0) {
                    size_t written = 0;
                    while (written < size) {
                        ssize_t w = write(STDOUT_FILENO, data + written, size - written);
                        if (w <= 0) break;
                        written += w;
                    }
                    fflush(stdout);
                }
            } else if (ret == GP_ERROR_CAMERA_BUSY) {
                // Camera is momentarily busy exposing still photo - normal, skip frame
                consecutive_preview_errors = 0;
            } else {
                consecutive_preview_errors++;
                // If more than 30 consecutive fatal errors, camera was unplugged
                if (consecutive_preview_errors > 30) {
                    fprintf(stderr, "STATUS:FATAL_ERROR:Camera USB disconnected (%d)\n", ret);
                    fflush(stderr);
                    gp_file_free(preview_file);
                    break;
                }
            }
            gp_file_free(preview_file);
        }

        // 4. Physical Shutter: Wait for camera events (15ms timeout per loop)
        if (g_running) {
            CameraEventType event_type;
            void *event_data = NULL;
            ret = gp_camera_wait_for_event(camera, 15, &event_type, &event_data, context);
            if (ret == GP_OK) {
                if (event_type == GP_EVENT_FILE_ADDED && event_data) {
                    CameraFilePath *ev_path = (CameraFilePath *)event_data;
                    fprintf(stderr, "STATUS:PHYSICAL_SHUTTER:%s/%s\n", ev_path->folder, ev_path->name);
                    fflush(stderr);

                    char full_path[512];
                    generate_filename(dest_dir, ev_path->name, full_path, sizeof(full_path));

                    CameraFile *photo_file = NULL;
                    gp_file_new(&photo_file);
                    ret = gp_camera_file_get(camera, ev_path->folder, ev_path->name, GP_FILE_TYPE_NORMAL, photo_file, context);
                    if (ret == GP_OK) {
                        gp_file_save(photo_file, full_path);
                        fprintf(stderr, "PHOTO:CAPTURED:%s\n", full_path);
                        fflush(stderr);
                    } else {
                        fprintf(stderr, "STATUS:DOWNLOAD_ERROR:%d\n", ret);
                        fflush(stderr);
                    }
                    gp_file_free(photo_file);
                    free(event_data);
                } else if (event_data) {
                    free(event_data);
                }
            } else if (ret != GP_ERROR_TIMEOUT && ret != GP_OK) {
                if (ret != GP_ERROR_CAMERA_BUSY && consecutive_preview_errors > 25) {
                    fprintf(stderr, "STATUS:FATAL_ERROR:Camera event loop error (%d)\n", ret);
                    fflush(stderr);
                    break;
                }
            }
        }

        // Pacing delay (~25-30 fps)
        usleep(10000);
    }

    fprintf(stderr, "STATUS:DISCONNECTING\n");
    fflush(stderr);

    gp_camera_exit(camera, context);
    gp_camera_free(camera);
    gp_context_unref(context);

    fprintf(stderr, "STATUS:DISCONNECTED\n");
    fflush(stderr);
    return 0;
}
