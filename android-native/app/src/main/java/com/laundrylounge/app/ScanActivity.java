package com.laundrylounge.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Size;
import android.view.Gravity;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;
import java.util.Arrays;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/** Native Camera2 preview and bundled, offline ML Kit QR recognition. */
public final class ScanActivity extends Activity implements TextureView.SurfaceTextureListener {
    private static final int CAMERA_PERMISSION = 41;
    private TextureView preview;
    private TextView status;
    private CameraDevice camera;
    private CameraCaptureSession session;
    private ImageReader reader;
    private Surface previewSurface;
    private HandlerThread worker;
    private Handler cameraHandler;
    private BarcodeScanner scanner;
    private final Object imageLock = new Object();
    private final List<ImageReader> retiringReaders = new ArrayList<>();
    private volatile boolean destroyed;
    private final AtomicBoolean processing = new AtomicBoolean(false);
    private volatile boolean running;
    private volatile boolean finished;
    private volatile boolean opening;
    private int imageRotation = 90;
    private Size previewSize = new Size(640, 480);

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Ui.BG);
        getWindow().setNavigationBarColor(Ui.BG);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        LinearLayout root = Ui.column(this); root.setBackgroundColor(Ui.BG);
        int padding = Ui.dp(this, 20); root.setPadding(padding, padding, padding, padding);
        if (Build.VERSION.SDK_INT >= 30) root.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
            view.setPadding(padding + bars.left, padding + bars.top, padding + bars.right, padding + bars.bottom); return insets;
        });
        root.addView(Ui.text(this, "Scan garment tag", 24, Ui.INK, true));
        Ui.gap(this, root, 8);
        root.addView(Ui.text(this, "Place the printed QR tag inside the frame. Scanning works offline.", 13, Ui.MUTED, false));
        Ui.gap(this, root, 18);
        FrameLayout cameraBox = new FrameLayout(this); cameraBox.setBackgroundColor(Color.rgb(28, 46, 37));
        root.addView(cameraBox, new LinearLayout.LayoutParams(-1, 0, 1));
        preview = new TextureView(this); preview.setSurfaceTextureListener(this);
        cameraBox.addView(preview, new FrameLayout.LayoutParams(-1, -1));
        cameraBox.addView(new TargetView(), new FrameLayout.LayoutParams(-1, -1));
        status = Ui.text(this, "Preparing camera…", 12, Ui.MUTED, false); status.setGravity(Gravity.CENTER); status.setPadding(0, Ui.dp(this, 14), 0, Ui.dp(this, 7)); root.addView(status);
        root.addView(Ui.button(this, "Enter printed tag number", () -> {
            if (finished) return; finished = true;
            setResult(RESULT_OK, new Intent().putExtra("manual", true)); finish();
        }, true));
        root.addView(Ui.button(this, "Close scanner", this::finish, true));
        setContentView(root);
        scanner = BarcodeScanning.getClient(new BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build());
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION);
        }
    }
    @Override protected void onResume() {
        super.onResume(); running = true;
        worker = new HandlerThread("LaundryLoungeCamera"); worker.start(); cameraHandler = new Handler(worker.getLooper());
        if (preview != null && preview.isAvailable()) openCamera();
    }
    @Override protected void onPause() {
        running = false; closeCamera();
        if (worker != null) { worker.quitSafely(); worker = null; cameraHandler = null; }
        super.onPause();
    }
    @Override protected void onDestroy() { destroyed = true; synchronized (imageLock) { if (!processing.get() && scanner != null) scanner.close(); } super.onDestroy(); }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != CAMERA_PERMISSION) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) openCamera();
        else showStatus("Allow Camera permission in Android Settings to scan, or enter the printed tag number below.");
    }
    private void openCamera() {
        if (!running || finished || opening || camera != null || preview == null || !preview.isAvailable() || cameraHandler == null) return;
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            showStatus("Camera permission is needed for scanning. Printed tag entry is always available."); return;
        }
        opening = true;
        try {
            CameraManager manager = (CameraManager) getSystemService(CAMERA_SERVICE);
            String chosen = null; CameraCharacteristics characteristics = null;
            for (String id : manager.getCameraIdList()) {
                CameraCharacteristics candidate = manager.getCameraCharacteristics(id);
                Integer facing = candidate.get(CameraCharacteristics.LENS_FACING);
                if (chosen == null || (facing != null && facing == CameraCharacteristics.LENS_FACING_BACK)) { chosen = id; characteristics = candidate; }
                if (facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) break;
            }
            if (chosen == null || characteristics == null) throw new IllegalStateException("No camera is available.");
            StreamConfigurationMap map = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            if (map == null) throw new IllegalStateException("The camera does not support image scanning.");
            Size imageSize = closestSize(map.getOutputSizes(ImageFormat.YUV_420_888), 640, 480);
            previewSize = closestSize(map.getOutputSizes(SurfaceTexture.class), imageSize.getWidth(), imageSize.getHeight());
            Integer sensor = characteristics.get(CameraCharacteristics.SENSOR_ORIENTATION);
            int rotation = getWindowManager().getDefaultDisplay().getRotation();
            int screenDegrees = rotation == Surface.ROTATION_90 ? 90 : rotation == Surface.ROTATION_180 ? 180 : rotation == Surface.ROTATION_270 ? 270 : 0;
            imageRotation = ((sensor == null ? 90 : sensor) - screenDegrees + 360) % 360;
            reader = ImageReader.newInstance(imageSize.getWidth(), imageSize.getHeight(), ImageFormat.YUV_420_888, 3);
            reader.setOnImageAvailableListener(this::readFrame, cameraHandler);
            manager.openCamera(chosen, new CameraDevice.StateCallback() {
                @Override public void onOpened(CameraDevice device) {
                    opening = false;
                    if (!running || finished) { device.close(); return; }
                    camera = device; startPreview();
                }
                @Override public void onDisconnected(CameraDevice device) { opening = false; device.close(); camera = null; showStatus("Camera disconnected. You can enter the printed tag number."); }
                @Override public void onError(CameraDevice device, int code) { opening = false; device.close(); camera = null; showStatus("The camera could not be opened. Close other camera apps, or use printed tag entry."); }
            }, cameraHandler);
        } catch (Exception error) { opening = false; closeCamera(); showStatus("Camera unavailable. Enter the printed tag number, or check camera permission in Android Settings."); }
    }
    private void startPreview() {
        try {
            if (camera == null || reader == null || !preview.isAvailable() || !running) return;
            SurfaceTexture texture = preview.getSurfaceTexture();
            if (texture == null) return;
            texture.setDefaultBufferSize(previewSize.getWidth(), previewSize.getHeight());
            previewSurface = new Surface(texture);
            final CaptureRequest.Builder request = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
            request.addTarget(previewSurface); request.addTarget(reader.getSurface());
            request.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
            camera.createCaptureSession(Arrays.asList(previewSurface, reader.getSurface()), new CameraCaptureSession.StateCallback() {
                @Override public void onConfigured(CameraCaptureSession configured) {
                    if (!running || camera == null || finished) { configured.close(); return; }
                    session = configured;
                    try { configured.setRepeatingRequest(request.build(), null, cameraHandler); showStatus("Point at a Laundry Lounge QR tag. Hold the phone steady."); }
                    catch (Exception error) { showStatus("Camera preview is unavailable. Printed tag entry is available below."); }
                }
                @Override public void onConfigureFailed(CameraCaptureSession failed) { showStatus("Camera preview is unavailable. Enter the printed tag number."); }
            }, cameraHandler);
        } catch (Exception error) { showStatus("Camera preview could not start. Enter the printed tag number instead."); }
    }
    private static Size closestSize(Size[] choices, int width, int height) {
        if (choices == null || choices.length == 0) throw new IllegalStateException("No camera image sizes available.");
        Size chosen = choices[0]; long best = Long.MAX_VALUE;
        for (Size size : choices) {
            long score = Math.abs(size.getWidth() - width) + Math.abs(size.getHeight() - height);
            if (size.getWidth() > 1920 || size.getHeight() > 1920) score += 1_000_000;
            if (score < best) { chosen = size; best = score; }
        }
        return chosen;
    }
    private void readFrame(ImageReader source) {
        Image image;
        synchronized (imageLock) {
            try { image = source.acquireLatestImage(); } catch (Exception closed) { return; }
            if (image == null) return;
            if (!running || finished || destroyed || scanner == null || !processing.compareAndSet(false, true)) { image.close(); return; }
        }
        try {
            scanner.process(InputImage.fromMediaImage(image, imageRotation))
                .addOnSuccessListener(this, codes -> {
                    if (!running || finished) return;
                    for (Barcode code : codes) {
                        String value = code.getRawValue();
                        if (value == null || value.trim().length() == 0) continue;
                        finished = true;
                        setResult(RESULT_OK, new Intent().putExtra("code", value)); finish(); break;
                    }
                })
                .addOnFailureListener(this, error -> showStatus("Could not read that frame. Move closer, or enter the printed tag number."))
                .addOnCompleteListener(task -> finishFrame(image));
        } catch (Exception error) { finishFrame(image); }
    }
    private void finishFrame(Image image) {
        synchronized (imageLock) {
            image.close(); processing.set(false);
            for (ImageReader old : retiringReaders) old.close();
            retiringReaders.clear();
            if (destroyed && scanner != null) scanner.close();
        }
    }
    private void showStatus(String message) { runOnUiThread(() -> { if (!isFinishing() && status != null) status.setText(message); }); }
    private void closeCamera() {
        opening = false;
        if (session != null) { try { session.stopRepeating(); } catch (Exception ignored) {} session.close(); session = null; }
        if (camera != null) { camera.close(); camera = null; }
        synchronized (imageLock) {
            if (reader != null) {
                if (processing.get()) retiringReaders.add(reader); else reader.close();
                reader = null;
            }
        }
        if (previewSurface != null) { previewSurface.release(); previewSurface = null; }
    }
    @Override public void onSurfaceTextureAvailable(SurfaceTexture texture, int width, int height) { openCamera(); }
    @Override public void onSurfaceTextureSizeChanged(SurfaceTexture texture, int width, int height) {}
    @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture texture) { closeCamera(); return true; }
    @Override public void onSurfaceTextureUpdated(SurfaceTexture texture) {}
    private final class TargetView extends View {
        final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        TargetView() { super(ScanActivity.this); setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO); }
        @Override protected void onDraw(android.graphics.Canvas canvas) {
            super.onDraw(canvas);
            float size = Math.min(getWidth(), getHeight()) * .68f;
            RectF rect = new RectF((getWidth() - size) / 2, (getHeight() - size) / 2, (getWidth() + size) / 2, (getHeight() + size) / 2);
            paint.setColor(Color.rgb(172, 233, 204)); paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(Ui.dp(ScanActivity.this, 3));
            canvas.drawRoundRect(rect, Ui.dp(ScanActivity.this, 16), Ui.dp(ScanActivity.this, 16), paint);
        }
    }
}
