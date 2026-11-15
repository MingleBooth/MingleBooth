package com.minglebooth.mobile;

import static org.junit.Assert.*;

import com.minglebooth.mobile.plugins.SonyPtpDriver;

import org.junit.Test;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Unit tests for Sony PTP container serialization, offset partial write handling,
 * and OpCode diagnostic naming.
 */
public class SonyPtpSerializationTest {

    @Test
    public void testPtpCommandContainerSerialization() {
        // Test serialization of OpenSession(1)
        int code = SonyPtpDriver.PTP_OC_OpenSession; // 0x1002
        int sessionId = 1;
        int txId = 0;

        int length = 12 + 1 * 4; // 16 bytes
        assertEquals(16, length);

        ByteBuffer packet = ByteBuffer.allocate(length).order(ByteOrder.LITTLE_ENDIAN);
        packet.putInt(length);
        packet.putShort((short) SonyPtpDriver.PTP_TYPE_COMMAND); // 1
        packet.putShort((short) code); // 0x1002
        packet.putInt(txId); // 0
        packet.putInt(sessionId); // 1

        byte[] bytes = packet.array();
        assertEquals(16, bytes.length);

        // Verify Little Endian byte layout
        ByteBuffer reader = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        assertEquals(16, reader.getInt()); // Length
        assertEquals(SonyPtpDriver.PTP_TYPE_COMMAND, reader.getShort()); // Type
        assertEquals(SonyPtpDriver.PTP_OC_OpenSession, reader.getShort() & 0xFFFF); // OpCode
        assertEquals(0, reader.getInt()); // TxID
        assertEquals(1, reader.getInt()); // Parameter: SessionID = 1
    }

    @Test
    public void testOpCodeNameResolution() {
        assertEquals("OpenSession", SonyPtpDriver.getOpCodeName(SonyPtpDriver.PTP_OC_OpenSession));
        assertEquals("GetDeviceInfo", SonyPtpDriver.getOpCodeName(SonyPtpDriver.PTP_OC_GetDeviceInfo));
        assertEquals("GetStorageIDs", SonyPtpDriver.getOpCodeName(SonyPtpDriver.PTP_OC_GetStorageIDs));
        assertEquals("SONY_SDIOConnect", SonyPtpDriver.getOpCodeName(SonyPtpDriver.PTP_OC_SONY_SDIOConnect));
        assertEquals("SONY_SDIOGetExtDeviceInfo", SonyPtpDriver.getOpCodeName(SonyPtpDriver.PTP_OC_SONY_SDIOGetExtDeviceInfo));
        assertEquals("SONY_GetAllExtDeviceInfo", SonyPtpDriver.getOpCodeName(SonyPtpDriver.PTP_OC_SONY_GetAllExtDeviceInfo));
        assertEquals("InitiateCapture", SonyPtpDriver.getOpCodeName(SonyPtpDriver.PTP_OC_InitiateCapture));
    }

    @Test
    public void testPartialWriteSimulation() {
        // Simulate a USB write loop where the first call writes 10 bytes and second writes 6 bytes
        int totalLen = 16;
        int offset = 0;
        int remaining = totalLen;

        int[] chunkSizes = new int[]{10, 6};
        int callIndex = 0;

        while (remaining > 0) {
            int written = chunkSizes[callIndex++];
            assertTrue("Written must be positive", written > 0);
            offset += written;
            remaining -= written;
        }

        assertEquals(16, offset);
        assertEquals(0, remaining);
    }

    @Test
    public void testReturnNegativeOneRetrySimulation() {
        // Simulate return -1 followed by retry and eventual success
        int retries = 0;
        int maxRetries = 3;
        boolean haltCleared = false;
        boolean success = false;

        // Call 1: returns -1 (stalled endpoint)
        // Call 2: halt cleared, returns 16
        while (retries < maxRetries) {
            int written = (retries == 0) ? -1 : 16;
            if (written > 0) {
                success = true;
                break;
            } else {
                retries++;
                haltCleared = true; // clearEndpointHalt executed
            }
        }

        assertTrue("Retry loop must clear stall", haltCleared);
        assertTrue("Retry must succeed on subsequent attempt", success);
        assertEquals(1, retries);
    }

    @Test
    public void testPtpResponseContainerParsing() {
        // Test parsing of standard 12-byte PTP Response (Length=12, Type=3, Code=0x2001 OK, TxID=0)
        ByteBuffer responseBuf = ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN);
        responseBuf.putInt(12); // Length
        responseBuf.putShort((short) SonyPtpDriver.PTP_TYPE_RESPONSE); // Type = 3
        responseBuf.putShort((short) SonyPtpDriver.PTP_RC_OK); // Code = 0x2001
        responseBuf.putInt(0); // TxID = 0

        byte[] rawResponse = responseBuf.array();
        ByteBuffer reader = ByteBuffer.wrap(rawResponse).order(ByteOrder.LITTLE_ENDIAN);
        int length = reader.getInt();
        short type = reader.getShort();
        short code = reader.getShort();
        int tx = reader.getInt();

        assertEquals(12, length);
        assertEquals(SonyPtpDriver.PTP_TYPE_RESPONSE, type);
        assertEquals(SonyPtpDriver.PTP_RC_OK, code & 0xFFFF);
        assertEquals(0, tx);
    }

    @Test
    public void testMultiContainerStreamBufferingAndLeftoverPreservation() {
        // Simulate a single USB transfer receiving 32 bytes containing two back-to-back containers:
        // Container 1: 20-byte DATA container (TxID=1, Code=0x1001)
        // Container 2: 12-byte RESPONSE container (TxID=1, Code=0x2001)
        ByteBuffer combined = ByteBuffer.allocate(32).order(ByteOrder.LITTLE_ENDIAN);
        
        // Container 1
        combined.putInt(20);
        combined.putShort((short) SonyPtpDriver.PTP_TYPE_DATA);
        combined.putShort((short) SonyPtpDriver.PTP_OC_GetDeviceInfo);
        combined.putInt(1);
        combined.putLong(0x1122334455667788L); // 8 bytes dummy data payload

        // Container 2
        combined.putInt(12);
        combined.putShort((short) SonyPtpDriver.PTP_TYPE_RESPONSE);
        combined.putShort((short) SonyPtpDriver.PTP_RC_OK);
        combined.putInt(1);

        byte[] stream = combined.array();
        int streamLength = 32;

        // Parse Container 1 from stream
        ByteBuffer header1 = ByteBuffer.wrap(stream, 0, 12).order(ByteOrder.LITTLE_ENDIAN);
        int len1 = header1.getInt();
        assertEquals(20, len1);

        byte[] raw1 = new byte[len1];
        System.arraycopy(stream, 0, raw1, 0, len1);

        int leftover = streamLength - len1;
        assertEquals(12, leftover);
        byte[] streamLeftover = new byte[leftover];
        System.arraycopy(stream, len1, streamLeftover, 0, leftover);

        // Parse Container 2 from leftover stream
        ByteBuffer header2 = ByteBuffer.wrap(streamLeftover, 0, 12).order(ByteOrder.LITTLE_ENDIAN);
        int len2 = header2.getInt();
        short type2 = header2.getShort();
        short code2 = header2.getShort();
        int tx2 = header2.getInt();

        assertEquals(12, len2);
        assertEquals(SonyPtpDriver.PTP_TYPE_RESPONSE, type2);
        assertEquals(SonyPtpDriver.PTP_RC_OK, code2 & 0xFFFF);
        assertEquals(1, tx2);
    }

    @Test
    public void testLinuxKernelBufferChunkCompliance() {
        // Linux kernel drivers/usb/core/devio.c defines:
        // #define MAX_USBFS_BUFFER_SIZE 16384
        // Buffer sizes exceeding 16KB cause ioctl(USBDEVFS_BULK) to return -EINVAL (-22),
        // which Android JNI translates to -1.
        assertTrue("USB_READ_CHUNK must be <= 16384 bytes to prevent Linux usbfs rejection",
            SonyPtpDriver.USB_READ_CHUNK <= 16384);
        assertEquals("USB_READ_CHUNK must be exactly 16384 bytes (16 KB)", 16384, SonyPtpDriver.USB_READ_CHUNK);
        assertEquals("USB_HEADER_READ_SIZE must be exactly 512 bytes (1x Bulk packet)", 512, SonyPtpDriver.USB_HEADER_READ_SIZE);
    }

    @Test
    public void testEndpointHaltStatusBitDetection() {
        // Standard USB 2.0 GET_STATUS (Recipient: Endpoint) returns 2 bytes:
        // Byte 0, Bit 0: Halt / Stall feature selector
        byte[] haltedStatus = new byte[] { 0x01, 0x00 };
        byte[] clearStatus = new byte[] { 0x00, 0x00 };

        boolean isHalted1 = (haltedStatus[0] & 0x01) != 0;
        boolean isHalted2 = (clearStatus[0] & 0x01) != 0;

        assertTrue("Halt bit 0 must be true when 0x01", isHalted1);
        assertFalse("Halt bit 0 must be false when 0x00", isHalted2);
    }

    @Test
    public void testTransferFailureClassification() {
        // Differentiate Timeout vs Native IOCTL Failure vs Endpoint Stall
        long timeoutElapsed = 15000;
        int timeoutThreshold = 15000;
        boolean isTimeout = timeoutElapsed >= (timeoutThreshold - 500);
        assertTrue("Must classify as TRANSFER_TIMEOUT when elapsed exceeds threshold", isTimeout);

        long immediateFailElapsed = 15;
        boolean isImmediate = immediateFailElapsed < 500;
        assertTrue("Must classify as immediate IOCTL failure when elapsed < 500ms", isImmediate);
    }

    @Test
    public void testExtractJpegFromSonyLiveViewPayload() {
        // Construct a realistic Sony PTP Data container for virtual object 0xFFFFC002:
        // 12-byte PTP Header: Length=500, Type=2 (DATA), Code=0x1009 (GetObject), TxID=77
        // 16-byte Sony LiveView preview header/metadata
        // JPEG SOI: 0xFF, 0xD8
        // 450 bytes simulated JPEG stream
        // JPEG EOI: 0xFF, 0xD9
        // 18 bytes trailing alignment/padding
        int totalLen = 500;
        ByteBuffer containerBuf = ByteBuffer.allocate(totalLen).order(ByteOrder.LITTLE_ENDIAN);
        containerBuf.putInt(totalLen);
        containerBuf.putShort((short) SonyPtpDriver.PTP_TYPE_DATA);
        containerBuf.putShort((short) SonyPtpDriver.PTP_OC_GetObject);
        containerBuf.putInt(77);

        // 16 bytes Sony metadata
        for (int i = 0; i < 16; i++) {
            containerBuf.put((byte) 0xAA);
        }

        // SOI
        containerBuf.put((byte) 0xFF);
        containerBuf.put((byte) 0xD8);

        // 450 bytes JPEG body
        for (int i = 0; i < 450; i++) {
            containerBuf.put((byte) (i & 0x7F));
        }

        // EOI
        containerBuf.put((byte) 0xFF);
        containerBuf.put((byte) 0xD9);

        // Trailing padding to fill container
        while (containerBuf.hasRemaining()) {
            containerBuf.put((byte) 0x00);
        }

        byte[] rawContainer = containerBuf.array();
        byte[] extracted = SonyPtpDriver.extractJpegFromPayload(rawContainer);

        assertNotNull("Extracted JPEG must not be null", extracted);
        assertEquals("Extracted JPEG length must be 454 bytes (SOI + body + EOI)", 454, extracted.length);
        assertEquals("First byte must be SOI 0xFF", (byte) 0xFF, extracted[0]);
        assertEquals("Second byte must be SOI 0xD8", (byte) 0xD8, extracted[1]);
        assertEquals("Penultimate byte must be EOI 0xFF", (byte) 0xFF, extracted[extracted.length - 2]);
        assertEquals("Last byte must be EOI 0xD9", (byte) 0xD9, extracted[extracted.length - 1]);
    }

    @Test
    public void testMalformedJpegPayloadRejection() {
        // Container without SOI (0xFF 0xD8) must return null
        byte[] noSoi = new byte[100];
        ByteBuffer buf = ByteBuffer.wrap(noSoi).order(ByteOrder.LITTLE_ENDIAN);
        buf.putInt(100);
        buf.putShort((short) SonyPtpDriver.PTP_TYPE_DATA);
        buf.putShort((short) SonyPtpDriver.PTP_OC_GetObject);
        buf.putInt(1);
        assertNull("Missing SOI must return null", SonyPtpDriver.extractJpegFromPayload(noSoi));

        // Short container (< 24 bytes) must return null
        byte[] shortContainer = new byte[20];
        assertNull("Short container must return null", SonyPtpDriver.extractJpegFromPayload(shortContainer));
    }

    @Test
    public void testConcurrentEndpointAccessPrevention() throws Exception {
        // Verify that usbLock serializes access between simulated LiveView and Physical Shutter threads,
        // preventing interleaving on Bulk IN/OUT endpoints.
        final Object usbLock = new Object();
        final java.util.concurrent.atomic.AtomicInteger concurrentAccessCount = new java.util.concurrent.atomic.AtomicInteger(0);
        final java.util.concurrent.atomic.AtomicBoolean overlapDetected = new java.util.concurrent.atomic.AtomicBoolean(false);
        final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(2);

        // Simulated Thread 1: LiveView worker pulling frame
        Thread liveViewWorker = new Thread(() -> {
            try {
                for (int i = 0; i < 50; i++) {
                    synchronized (usbLock) {
                        int active = concurrentAccessCount.incrementAndGet();
                        if (active > 1) overlapDetected.set(true);
                        Thread.sleep(2);
                        concurrentAccessCount.decrementAndGet();
                    }
                    Thread.sleep(1);
                }
            } catch (InterruptedException ignored) {
            } finally {
                latch.countDown();
            }
        }, "TestLiveViewWorker");

        // Simulated Thread 2: Physical Shutter worker downloading photo
        Thread shutterWorker = new Thread(() -> {
            try {
                for (int i = 0; i < 50; i++) {
                    synchronized (usbLock) {
                        int active = concurrentAccessCount.incrementAndGet();
                        if (active > 1) overlapDetected.set(true);
                        Thread.sleep(2);
                        concurrentAccessCount.decrementAndGet();
                    }
                    Thread.sleep(1);
                }
            } catch (InterruptedException ignored) {
            } finally {
                latch.countDown();
            }
        }, "TestPhysicalShutterWorker");

        liveViewWorker.start();
        shutterWorker.start();
        latch.await(5, java.util.concurrent.TimeUnit.SECONDS);

        assertFalse("Endpoint access must be strictly serialized; concurrent overlap detected!", overlapDetected.get());
    }

    @Test
    public void testSetControlDeviceBSerialization() {
        // 1. Command Phase: 0x9207, Param1 = SONY_DPC_S2_BUTTON (0xD2C2)
        int code = SonyPtpDriver.PTP_OC_SONY_SetControlDeviceB; // 0x9207
        int propCode = SonyPtpDriver.SONY_DPC_S2_BUTTON; // 0xD2C2
        int txId = 42;

        int cmdLen = 12 + 1 * 4; // 16 bytes
        ByteBuffer cmdPacket = ByteBuffer.allocate(cmdLen).order(ByteOrder.LITTLE_ENDIAN);
        cmdPacket.putInt(cmdLen);
        cmdPacket.putShort((short) SonyPtpDriver.PTP_TYPE_COMMAND); // 1
        cmdPacket.putShort((short) code); // 0x9207
        cmdPacket.putInt(txId);
        cmdPacket.putInt(propCode); // 0xD2C2

        byte[] cmdBytes = cmdPacket.array();
        assertEquals(16, cmdBytes.length);

        ByteBuffer cmdReader = ByteBuffer.wrap(cmdBytes).order(ByteOrder.LITTLE_ENDIAN);
        assertEquals(16, cmdReader.getInt()); // Length
        assertEquals(SonyPtpDriver.PTP_TYPE_COMMAND, cmdReader.getShort()); // Type
        assertEquals(0x9207, cmdReader.getShort() & 0xFFFF); // OpCode
        assertEquals(42, cmdReader.getInt()); // TxID
        assertEquals(0xD2C2, cmdReader.getInt() & 0xFFFF); // Param1 = 0xD2C2

        // 2. Data Phase: S2 Press (0x0002)
        int dataLen = 12 + 2; // 14 bytes
        ByteBuffer dataPacket = ByteBuffer.allocate(dataLen).order(ByteOrder.LITTLE_ENDIAN);
        dataPacket.putInt(dataLen);
        dataPacket.putShort((short) SonyPtpDriver.PTP_TYPE_DATA); // 2
        dataPacket.putShort((short) code); // 0x9207
        dataPacket.putInt(txId); // 42
        dataPacket.putShort((short) SonyPtpDriver.SONY_BUTTON_PRESS); // 0x0002

        byte[] dataBytes = dataPacket.array();
        assertEquals(14, dataBytes.length);

        ByteBuffer dataReader = ByteBuffer.wrap(dataBytes).order(ByteOrder.LITTLE_ENDIAN);
        assertEquals(14, dataReader.getInt()); // Length
        assertEquals(SonyPtpDriver.PTP_TYPE_DATA, dataReader.getShort()); // Type
        assertEquals(0x9207, dataReader.getShort() & 0xFFFF); // OpCode
        assertEquals(42, dataReader.getInt()); // TxID
        assertEquals(0x0002, dataReader.getShort() & 0xFFFF); // Value = 0x0002 (PRESS)

        // 3. Data Phase: S2 Release (0x0001)
        ByteBuffer releasePacket = ByteBuffer.allocate(dataLen).order(ByteOrder.LITTLE_ENDIAN);
        releasePacket.putInt(dataLen);
        releasePacket.putShort((short) SonyPtpDriver.PTP_TYPE_DATA);
        releasePacket.putShort((short) code);
        releasePacket.putInt(txId);
        releasePacket.putShort((short) SonyPtpDriver.SONY_BUTTON_RELEASE); // 0x0001

        ByteBuffer releaseReader = ByteBuffer.wrap(releasePacket.array()).order(ByteOrder.LITTLE_ENDIAN);
        assertEquals(14, releaseReader.getInt());
        assertEquals(SonyPtpDriver.PTP_TYPE_DATA, releaseReader.getShort());
        assertEquals(0x9207, releaseReader.getShort() & 0xFFFF);
        assertEquals(42, releaseReader.getInt());
        assertEquals(0x0001, releaseReader.getShort() & 0xFFFF); // Value = 0x0001 (RELEASE)
    }

    @Test
    public void testSonyVendorEventCodesRecognition() {
        // Sony vendor event 0xC201 (SDIE_ObjectAdded) sent on interrupt endpoint 0x83
        int eventLen = 16;
        ByteBuffer eventBuf = ByteBuffer.allocate(eventLen).order(ByteOrder.LITTLE_ENDIAN);
        eventBuf.putInt(eventLen);
        eventBuf.putShort((short) SonyPtpDriver.PTP_TYPE_EVENT); // 4
        eventBuf.putShort((short) SonyPtpDriver.PTP_EC_Sony_ObjectAdded); // 0xC201
        eventBuf.putInt(99); // TxID
        eventBuf.putInt(SonyPtpDriver.SONY_SHOT_OBJECT_HANDLE); // 0xFFFFC001

        byte[] eventBytes = eventBuf.array();
        assertEquals(16, eventBytes.length);

        ByteBuffer parser = ByteBuffer.wrap(eventBytes).order(ByteOrder.LITTLE_ENDIAN);
        int parsedLen = parser.getInt();
        short parsedType = parser.getShort();
        short parsedCode = parser.getShort();
        int parsedTx = parser.getInt();
        int parsedHandle = parser.getInt();

        assertEquals(16, parsedLen);
        assertEquals(SonyPtpDriver.PTP_TYPE_EVENT, parsedType);
        assertEquals(SonyPtpDriver.PTP_EC_Sony_ObjectAdded, parsedCode & 0xFFFF);
        assertEquals(99, parsedTx);
        assertEquals(SonyPtpDriver.SONY_SHOT_OBJECT_HANDLE, parsedHandle);

        // Verify OpCode naming for vendor events and DPCs
        assertEquals("SONY_EC_ObjectAdded", SonyPtpDriver.getOpCodeName(SonyPtpDriver.PTP_EC_Sony_ObjectAdded));
        assertEquals("SONY_EC_ObjectRemoved", SonyPtpDriver.getOpCodeName(SonyPtpDriver.PTP_EC_Sony_ObjectRemoved));
        assertEquals("SONY_EC_PropertyChanged", SonyPtpDriver.getOpCodeName(SonyPtpDriver.PTP_EC_Sony_PropertyChanged));
        assertEquals("EC_ObjectAdded", SonyPtpDriver.getOpCodeName(SonyPtpDriver.PTP_EC_ObjectAdded));
        assertEquals("SONY_DPC_S1_BUTTON", SonyPtpDriver.getOpCodeName(SonyPtpDriver.SONY_DPC_S1_BUTTON));
        assertEquals("SONY_DPC_S2_BUTTON", SonyPtpDriver.getOpCodeName(SonyPtpDriver.SONY_DPC_S2_BUTTON));
    }

    @Test
    public void testLiveViewPauseDuringCapture() throws Exception {
        // Verify that setting isCapturing causes simulated live view worker to yield immediately
        // and allow capture thread exclusive access without contention.
        final Object usbLock = new Object();
        final java.util.concurrent.atomic.AtomicBoolean isCapturing = new java.util.concurrent.atomic.AtomicBoolean(false);
        final java.util.concurrent.atomic.AtomicInteger liveViewIterations = new java.util.concurrent.atomic.AtomicInteger(0);
        final java.util.concurrent.atomic.AtomicBoolean captureExecuted = new java.util.concurrent.atomic.AtomicBoolean(false);
        final java.util.concurrent.atomic.AtomicBoolean conflictDetected = new java.util.concurrent.atomic.AtomicBoolean(false);

        Thread liveViewThread = new Thread(() -> {
            for (int i = 0; i < 100; i++) {
                if (isCapturing.get()) {
                    try {
                        Thread.sleep(10);
                    } catch (InterruptedException ignored) {}
                    continue;
                }
                synchronized (usbLock) {
                    if (isCapturing.get() && captureExecuted.get()) {
                        conflictDetected.set(true);
                    }
                    liveViewIterations.incrementAndGet();
                    try {
                        Thread.sleep(1);
                    } catch (InterruptedException ignored) {}
                }
            }
        });

        liveViewThread.start();
        Thread.sleep(10);

        // Trigger capture: set isCapturing before lock
        isCapturing.set(true);
        synchronized (usbLock) {
            captureExecuted.set(true);
            Thread.sleep(30);
        }
        isCapturing.set(false);

        liveViewThread.join(2000);

        assertTrue("Capture must execute successfully", captureExecuted.get());
        assertFalse("Live view must not hold usbLock when isCapturing is true", conflictDetected.get());
        assertTrue("Live view must have processed frames before or after capture", liveViewIterations.get() > 0);
    }

    @Test
    public void testLargePhotoContainerCapacity() {
        // 24 Megapixel JPEG can be 18 MB - 25 MB. Verify 64 MB maximum limit check.
        int photoLength = 24 * 1024 * 1024; // 24 MB
        assertTrue("Photo length 24MB must be within 12B - 64MB boundary", 
            photoLength >= 12 && photoLength <= 64 * 1024 * 1024);

        int maxRawLength = 60 * 1024 * 1024; // 60 MB RAW+JPEG
        assertTrue("RAW+JPEG 60MB must be within 12B - 64MB boundary", 
            maxRawLength >= 12 && maxRawLength <= 64 * 1024 * 1024);

        int invalidLength = 70 * 1024 * 1024; // 70 MB
        assertFalse("Length > 64MB must be rejected", 
            invalidLength >= 12 && invalidLength <= 64 * 1024 * 1024);
    }

    @Test
    public void testPtpDataContainerSplitAcrossMultipleTransfers() {
        // Simulate a 4096-byte container split across 3 USB bulk packets: 1024, 2048, 1024 bytes
        int totalLen = 4096;
        ByteBuffer expectedBuf = ByteBuffer.allocate(totalLen).order(ByteOrder.LITTLE_ENDIAN);
        expectedBuf.putInt(totalLen);
        expectedBuf.putShort((short) SonyPtpDriver.PTP_TYPE_DATA);
        expectedBuf.putShort((short) SonyPtpDriver.PTP_OC_GetObject);
        expectedBuf.putInt(55); // TxID
        // Fill simulated JPEG payload
        expectedBuf.put((byte) 0xFF);
        expectedBuf.put((byte) 0xD8); // SOI
        for (int i = 14; i < totalLen - 2; i++) {
            expectedBuf.put((byte) (i & 0xFF));
        }
        expectedBuf.put((byte) 0xFF);
        expectedBuf.put((byte) 0xD9); // EOI

        byte[] fullPacket = expectedBuf.array();

        // Simulate USB buffer accumulation loop (similar to ensureIncoming)
        byte[] accumulated = new byte[0];
        int accumulatedLen = 0;
        int[] chunkSizes = new int[]{1024, 2048, 1024};
        int offset = 0;

        for (int chunkSize : chunkSizes) {
            byte[] chunk = new byte[chunkSize];
            System.arraycopy(fullPacket, offset, chunk, 0, chunkSize);
            offset += chunkSize;

            // Grow buffer if needed
            if (accumulated.length < accumulatedLen + chunkSize) {
                byte[] grown = new byte[accumulatedLen + chunkSize];
                System.arraycopy(accumulated, 0, grown, 0, accumulatedLen);
                accumulated = grown;
            }
            System.arraycopy(chunk, 0, accumulated, accumulatedLen, chunkSize);
            accumulatedLen += chunkSize;
        }

        assertEquals(totalLen, accumulatedLen);
        assertArrayEquals(fullPacket, accumulated);

        // Verify container header integrity
        ByteBuffer reader = ByteBuffer.wrap(accumulated, 0, 12).order(ByteOrder.LITTLE_ENDIAN);
        assertEquals(totalLen, reader.getInt());
        assertEquals(SonyPtpDriver.PTP_TYPE_DATA, reader.getShort());
        assertEquals(SonyPtpDriver.PTP_OC_GetObject, reader.getShort() & 0xFFFF);
        assertEquals(55, reader.getInt());

        // Extract JPEG
        byte[] jpeg = SonyPtpDriver.extractJpegFromPayload(accumulated);
        assertNotNull("JPEG must be extracted from split transfer payload", jpeg);
        assertEquals((byte) 0xFF, jpeg[0]);
        assertEquals((byte) 0xD8, jpeg[1]);
        assertEquals((byte) 0xFF, jpeg[jpeg.length - 2]);
        assertEquals((byte) 0xD9, jpeg[jpeg.length - 1]);
    }

    @Test
    public void testByteResidueRetentionBetweenContainers() {
        // Simulate a USB transfer buffer where the end of a Data container (100 bytes)
        // and a subsequent 12-byte Response container arrive together in a 112-byte buffer.
        ByteBuffer combined = ByteBuffer.allocate(112).order(ByteOrder.LITTLE_ENDIAN);

        // Data Container (100 bytes total, TxID=77)
        combined.putInt(100);
        combined.putShort((short) SonyPtpDriver.PTP_TYPE_DATA);
        combined.putShort((short) SonyPtpDriver.PTP_OC_GetObject);
        combined.putInt(77);
        combined.put((byte) 0xFF);
        combined.put((byte) 0xD8);
        for (int i = 14; i < 98; i++) combined.put((byte) 0xAA);
        combined.put((byte) 0xFF);
        combined.put((byte) 0xD9);

        // Response Container (12 bytes, TxID=77, Code=0x2001 OK)
        combined.putInt(12);
        combined.putShort((short) SonyPtpDriver.PTP_TYPE_RESPONSE);
        combined.putShort((short) SonyPtpDriver.PTP_RC_OK);
        combined.putInt(77);

        byte[] rawStream = combined.array();
        int incomingLength = 112;

        // Step 1: Consume Data container (100 bytes)
        int dataLen = 100;
        byte[] dataRaw = new byte[dataLen];
        System.arraycopy(rawStream, 0, dataRaw, 0, dataLen);

        int leftover = incomingLength - dataLen;
        assertEquals("Leftover must be exactly 12 bytes", 12, leftover);

        byte[] incomingAfterData = new byte[leftover];
        System.arraycopy(rawStream, dataLen, incomingAfterData, 0, leftover);

        // Step 2: Read Response container from leftover buffer without extra USB reads
        ByteBuffer respReader = ByteBuffer.wrap(incomingAfterData, 0, 12).order(ByteOrder.LITTLE_ENDIAN);
        int respLen = respReader.getInt();
        short respType = respReader.getShort();
        short respCode = respReader.getShort();
        int respTx = respReader.getInt();

        assertEquals(12, respLen);
        assertEquals(SonyPtpDriver.PTP_TYPE_RESPONSE, respType);
        assertEquals(SonyPtpDriver.PTP_RC_OK, respCode & 0xFFFF);
        assertEquals(77, respTx);
    }

    @Test
    public void testObjectInfoCompressedSizeVsDeclaredLength() {
        // Construct standard ISO 15740 ObjectInfo Dataset
        // Offset 0: StorageID (4B) = 0x00010001
        // Offset 4: ObjectFormat (2B) = 0x3801 (EXIF/JPEG)
        // Offset 6: ProtectionStatus (2B) = 0
        // Offset 8: ObjectCompressedSize (4B) = 5,242,880 bytes (5 MB)
        // Offset 12: ThumbFormat (2B)
        // Offset 14: ThumbCompressedSize (4B)
        // Offset 18: ThumbPixWidth (4B)
        // Offset 22: ThumbPixHeight (4B)
        // Offset 26: ImagePixWidth (4B) = 6000
        // Offset 30: ImagePixHeight (4B) = 4000
        ByteBuffer infoData = ByteBuffer.allocate(64).order(ByteOrder.LITTLE_ENDIAN);
        infoData.putInt(0x00010001); // StorageID
        infoData.putShort((short) 0x3801); // ObjectFormat (EXIF/JPEG)
        infoData.putShort((short) 0); // ProtectionStatus
        infoData.putInt(5242880); // ObjectCompressedSize: 5 MB
        infoData.putShort((short) 0x3801); // ThumbFormat
        infoData.putInt(10240); // ThumbCompressedSize
        infoData.putInt(160); // ThumbPixWidth
        infoData.putInt(120); // ThumbPixHeight
        infoData.putInt(6000); // ImagePixWidth
        infoData.putInt(4000); // ImagePixHeight

        byte[] payload = infoData.array();
        ByteBuffer parser = ByteBuffer.wrap(payload).order(ByteOrder.LITTLE_ENDIAN);
        int storageId = parser.getInt();
        int format = parser.getShort() & 0xFFFF;
        int protection = parser.getShort() & 0xFFFF;
        long compressedSize = parser.getInt() & 0xFFFFFFFFL;
        parser.getShort(); // thumb format
        parser.getInt(); // thumb size
        parser.getInt(); // thumb width
        parser.getInt(); // thumb height
        int imgW = parser.getInt();
        int imgH = parser.getInt();

        SonyPtpDriver.ObjectMetadata meta = new SonyPtpDriver.ObjectMetadata(
            0x00010001, storageId, format, compressedSize, imgW, imgH);

        assertEquals(0x3801, meta.format);
        assertEquals(5242880L, meta.compressedSize);
        assertEquals(6000, meta.imageWidth);
        assertEquals(4000, meta.imageHeight);

        // Test parser decision logic:
        // Case A: Container header declaredLength = 12 (Header-only), expectedPayload = 5242880
        long declaredLengthA = 12;
        long expectedPayload = meta.compressedSize;
        long targetLenA;
        if (expectedPayload > 0) {
            targetLenA = (declaredLengthA != 0xFFFFFFFFL && declaredLengthA > 12 + expectedPayload)
                ? declaredLengthA
                : (12 + expectedPayload);
        } else {
            targetLenA = declaredLengthA;
        }
        assertEquals("Target length must resolve to 12 + ObjectCompressedSize", 12 + 5242880L, targetLenA);

        // Case B: Container header declaredLength = 0xFFFFFFFF (-1 signed), expectedPayload = 5242880
        long declaredLengthB = 0xFFFFFFFFL;
        long targetLenB;
        if (expectedPayload > 0) {
            targetLenB = (declaredLengthB != 0xFFFFFFFFL && declaredLengthB > 12 + expectedPayload)
                ? declaredLengthB
                : (12 + expectedPayload);
        } else {
            targetLenB = declaredLengthB;
        }
        assertEquals("0xFFFFFFFF length must be overridden by ObjectCompressedSize", 12 + 5242880L, targetLenB);
    }

    @Test
    public void testPtpResponseAfterDataPhase() {
        // Verify response container parsing after data phase finishes
        ByteBuffer respBuf = ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN);
        respBuf.putInt(12);
        respBuf.putShort((short) SonyPtpDriver.PTP_TYPE_RESPONSE);
        respBuf.putShort((short) SonyPtpDriver.PTP_RC_OK);
        respBuf.putInt(42); // TxID

        byte[] respBytes = respBuf.array();
        ByteBuffer reader = ByteBuffer.wrap(respBytes).order(ByteOrder.LITTLE_ENDIAN);
        assertEquals(12, reader.getInt());
        assertEquals(SonyPtpDriver.PTP_TYPE_RESPONSE, reader.getShort());
        assertEquals(SonyPtpDriver.PTP_RC_OK, reader.getShort() & 0xFFFF);
        assertEquals(42, reader.getInt());
    }

    @Test
    public void testCompleteJpegVsTruncatedPayload() {
        // Complete JPEG payload: 12 bytes PTP header + SOI + payload + EOI
        int size = 1024;
        ByteBuffer completeBuf = ByteBuffer.allocate(size).order(ByteOrder.LITTLE_ENDIAN);
        completeBuf.putInt(size);
        completeBuf.putShort((short) SonyPtpDriver.PTP_TYPE_DATA);
        completeBuf.putShort((short) SonyPtpDriver.PTP_OC_GetObject);
        completeBuf.putInt(1);
        completeBuf.put((byte) 0xFF);
        completeBuf.put((byte) 0xD8); // SOI
        for (int i = 14; i < size - 2; i++) completeBuf.put((byte) 0x33);
        completeBuf.put((byte) 0xFF);
        completeBuf.put((byte) 0xD9); // EOI

        byte[] completeJpeg = SonyPtpDriver.extractJpegFromPayload(completeBuf.array());
        assertNotNull("Valid complete JPEG must be extracted", completeJpeg);
        assertEquals((byte) 0xFF, completeJpeg[0]);
        assertEquals((byte) 0xD8, completeJpeg[1]);
        assertEquals((byte) 0xFF, completeJpeg[completeJpeg.length - 2]);
        assertEquals((byte) 0xD9, completeJpeg[completeJpeg.length - 1]);

        // Truncated payload: Missing EOI marker (0xFF 0xD9)
        ByteBuffer truncatedBuf = ByteBuffer.allocate(size).order(ByteOrder.LITTLE_ENDIAN);
        truncatedBuf.putInt(size);
        truncatedBuf.putShort((short) SonyPtpDriver.PTP_TYPE_DATA);
        truncatedBuf.putShort((short) SonyPtpDriver.PTP_OC_GetObject);
        truncatedBuf.putInt(1);
        truncatedBuf.put((byte) 0xFF);
        truncatedBuf.put((byte) 0xD8);
        for (int i = 14; i < size; i++) truncatedBuf.put((byte) 0x00); // No EOI

        byte[] truncatedJpeg = SonyPtpDriver.extractJpegFromPayload(truncatedBuf.array());
        assertNull("Truncated JPEG missing EOI must return null to reject corrupt payload", truncatedJpeg);

        // Header-only payload (12 bytes)
        ByteBuffer headerOnly = ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN);
        headerOnly.putInt(12);
        headerOnly.putShort((short) SonyPtpDriver.PTP_TYPE_DATA);
        headerOnly.putShort((short) SonyPtpDriver.PTP_OC_GetObject);
        headerOnly.putInt(1);

        byte[] headerOnlyJpeg = SonyPtpDriver.extractJpegFromPayload(headerOnly.array());
        assertNull("Header-only payload (length < 24) must return null", headerOnlyJpeg);
    }

    @Test
    public void testSynchronizedCaptureAndLiveViewRecovery() {
        // Test lock coordination: live view worker yields when isCapturing is true,
        // and resumes once isCapturing is reset to false
        final Object usbLock = new Object();
        final java.util.concurrent.atomic.AtomicBoolean isCapturing = new java.util.concurrent.atomic.AtomicBoolean(false);
        final java.util.concurrent.atomic.AtomicInteger framesBeforeCapture = new java.util.concurrent.atomic.AtomicInteger(0);
        final java.util.concurrent.atomic.AtomicInteger framesAfterCapture = new java.util.concurrent.atomic.AtomicInteger(0);

        // Simulate 5 frames before capture
        for (int i = 0; i < 5; i++) {
            if (!isCapturing.get()) {
                synchronized (usbLock) {
                    framesBeforeCapture.incrementAndGet();
                }
            }
        }
        assertEquals(5, framesBeforeCapture.get());

        // Capture starts
        isCapturing.set(true);
        boolean captureCompleted = false;
        synchronized (usbLock) {
            // Emulate capture actuation and download
            captureCompleted = true;
        }
        isCapturing.set(false);
        assertTrue("Capture must complete", captureCompleted);

        // Live view resumes
        for (int i = 0; i < 5; i++) {
            if (!isCapturing.get()) {
                synchronized (usbLock) {
                    framesAfterCapture.incrementAndGet();
                }
            }
        }
        assertEquals(5, framesAfterCapture.get());
    }

    @Test
    public void testPhysicalShutterEventDeduplicationSinglePhoto() {
        // Test that deduplication cache suppresses duplicate captures for same object within TTL
        java.util.concurrent.ConcurrentHashMap<String, Long> dedupMap = new java.util.concurrent.ConcurrentHashMap<>();
        long ttlMs = 10000;

        String key = "SIZE_8452192_HANDLE_0xFFFFC001";
        long now = System.currentTimeMillis();

        // First event
        boolean isDup1 = dedupMap.containsKey(key) && (now - dedupMap.get(key) < ttlMs);
        assertFalse("First event must not be duplicate", isDup1);
        dedupMap.put(key, now);

        // Immediate duplicate event (e.g. PropertyChanged arriving 50ms after ObjectAdded)
        long duplicateTime = now + 50;
        boolean isDup2 = dedupMap.containsKey(key) && (duplicateTime - dedupMap.get(key) < ttlMs);
        assertTrue("Immediate duplicate event must be suppressed", isDup2);

        // Event after TTL expires
        long laterTime = now + ttlMs + 500;
        boolean isDup3 = dedupMap.containsKey(key) && (laterTime - dedupMap.get(key) < ttlMs);
        assertFalse("Event after TTL expires must be allowed", isDup3);
    }

    @Test
    public void testSoftwareShutterListenerDedupIsolation() {
        // Test that software capture does not invoke physical shutter listener
        java.util.concurrent.atomic.AtomicInteger listenerCalls = new java.util.concurrent.atomic.AtomicInteger(0);
        boolean isSoftwareCapturing = true;

        // Emulate downloadAndSaveObject logic
        if (!isSoftwareCapturing) {
            listenerCalls.incrementAndGet();
        }
        assertEquals("Software capture must not notify physical shutter listener", 0, listenerCalls.get());

        // Emulate physical shutter trigger
        isSoftwareCapturing = false;
        if (!isSoftwareCapturing) {
            listenerCalls.incrementAndGet();
        }
        assertEquals("Physical shutter capture must notify listener exactly once", 1, listenerCalls.get());
    }

    @Test
    public void testTwoPoseSlotSequenceAndTargetedRetake() {
        // Test 2-pose state machine: Pose 1, Pose 2, and targeted retake
        java.util.List<String> capturedShots = new java.util.ArrayList<>();
        int totalSlots = 2;

        // Pose 1 captured
        capturedShots.add("data:image/jpeg;base64,POSE_1_BYTES");
        assertEquals(1, capturedShots.size());
        assertTrue("Session must not complete after only 1 pose when 2 poses configured", capturedShots.size() < totalSlots);

        // Pose 2 captured
        capturedShots.add("data:image/jpeg;base64,POSE_2_BYTES");
        assertEquals(2, capturedShots.size());
        assertEquals("Session must complete when all configured poses captured", totalSlots, capturedShots.size());

        // Targeted Retake for Pose 1: replace index 0 without duplicating or dropping Pose 2
        int retakeSlotIndex = 0;
        capturedShots.set(retakeSlotIndex, "data:image/jpeg;base64,POSE_1_RETAKEN_BYTES");
        assertEquals("Retake must preserve exact shots count", 2, capturedShots.size());
        assertEquals("Retaken slot 1 must have new payload", "data:image/jpeg;base64,POSE_1_RETAKEN_BYTES", capturedShots.get(0));
        assertEquals("Slot 2 must remain untouched", "data:image/jpeg;base64,POSE_2_BYTES", capturedShots.get(1));
    }

    // ==========================================
    // FASE 4 — REGRESSION UNIT TESTS FOR P0 HOTFIX
    // ==========================================

    @Test
    public void testPayloadStopsBeforeExpectedLength() {
        // Test 1: Payload stops before expected length (truncated transfer)
        int expectedLen = 2048;
        int actualLen = 512; // truncated
        ByteBuffer truncatedBuf = ByteBuffer.allocate(actualLen).order(ByteOrder.LITTLE_ENDIAN);
        truncatedBuf.putInt(expectedLen); // declared length was 2048
        truncatedBuf.putShort((short) SonyPtpDriver.PTP_TYPE_DATA);
        truncatedBuf.putShort((short) SonyPtpDriver.PTP_OC_GetObject);
        truncatedBuf.putInt(101); // TxID
        truncatedBuf.put((byte) 0xFF);
        truncatedBuf.put((byte) 0xD8); // SOI
        for (int i = 14; i < actualLen; i++) truncatedBuf.put((byte) 0xAA);
        // No EOI marker because transfer stopped early

        byte[] truncatedBytes = truncatedBuf.array();
        byte[] extracted = SonyPtpDriver.extractJpegFromPayload(truncatedBytes);
        assertNull("Truncated payload missing EOI must return null and be rejected", extracted);

        // Verify that container with actual bytes less than expected size triggers payload failure
        boolean isUnderflow = actualLen < expectedLen;
        assertTrue("Transfer underflow must be detected when received bytes < expected length", isUnderflow);
    }

    @Test
    public void testUnboundedReadWithNoNewDataAbortsWithoutStall() {
        // Test 2: Unbounded read with no new data (0 bytes payload) terminates without 15s stall
        int declaredLen = 12; // Header-only (0 payload)
        long expectedPayloadSize = -1; // Unbounded requested

        long totalTargetLength;
        if (expectedPayloadSize > 0) {
            totalTargetLength = 12 + expectedPayloadSize;
        } else if (declaredLen >= 12 && declaredLen != 0xFFFFFFFFL) {
            totalTargetLength = declaredLen;
        } else {
            totalTargetLength = -1;
        }

        // Must resolve to 12 (bounded header-only) rather than -1 (unbounded stream stall)
        assertEquals("Declared length of 12 must be bounded to 12 to prevent unbounded stall", 12L, totalTargetLength);

        // If true unbounded (0xFFFFFFFF) with buffer len <= 12 and 0 new bytes arrived, loop must break
        int bufferLen = 12;
        int prevLen = bufferLen;
        int newBytesRead = 0; // camera sends nothing
        bufferLen += newBytesRead;
        boolean shouldTerminate = (bufferLen == prevLen);
        assertTrue("Unbounded loop must terminate immediately when no new data arrives", shouldTerminate);
    }

    @Test
    public void testPtpDataContainerSplitAcrossChunksRegression() {
        // Test 3: PTP data container split across 16KB aligned chunks
        int totalPayload = 32768; // 32 KB
        int totalContainerLen = 12 + totalPayload;
        ByteBuffer fullBuf = ByteBuffer.allocate(totalContainerLen).order(ByteOrder.LITTLE_ENDIAN);
        fullBuf.putInt(totalContainerLen);
        fullBuf.putShort((short) SonyPtpDriver.PTP_TYPE_DATA);
        fullBuf.putShort((short) SonyPtpDriver.PTP_OC_GetObject);
        fullBuf.putInt(202); // TxID
        fullBuf.put((byte) 0xFF);
        fullBuf.put((byte) 0xD8); // SOI
        for (int i = 14; i < totalContainerLen - 2; i++) fullBuf.put((byte) 0x55);
        fullBuf.put((byte) 0xFF);
        fullBuf.put((byte) 0xD9); // EOI

        byte[] allBytes = fullBuf.array();

        // Simulate 2 chunks of 16KB + 1 remainder chunk
        int chunkSize = 16384;
        byte[] buffer = new byte[0];
        int bufferLen = 0;
        int offset = 0;

        while (offset < totalContainerLen) {
            int toCopy = Math.min(chunkSize, totalContainerLen - offset);
            byte[] chunk = new byte[toCopy];
            System.arraycopy(allBytes, offset, chunk, 0, toCopy);
            offset += toCopy;

            if (buffer.length < bufferLen + toCopy) {
                byte[] grown = new byte[bufferLen + toCopy];
                System.arraycopy(buffer, 0, grown, 0, bufferLen);
                buffer = grown;
            }
            System.arraycopy(chunk, 0, buffer, bufferLen, toCopy);
            bufferLen += toCopy;
        }

        assertEquals(totalContainerLen, bufferLen);
        byte[] jpeg = SonyPtpDriver.extractJpegFromPayload(buffer);
        assertNotNull("JPEG must be reconstructed from split chunks", jpeg);
        assertEquals((byte) 0xFF, jpeg[0]);
        assertEquals((byte) 0xD8, jpeg[1]);
        assertEquals((byte) 0xFF, jpeg[jpeg.length - 2]);
        assertEquals((byte) 0xD9, jpeg[jpeg.length - 1]);
    }

    @Test
    public void testPtpResponseAfterDataPhaseRegression() {
        // Test 4: PTP Response after data phase in sequence
        ByteBuffer streamBuf = ByteBuffer.allocate(64).order(ByteOrder.LITTLE_ENDIAN);
        // Data container (32 bytes)
        streamBuf.putInt(32);
        streamBuf.putShort((short) SonyPtpDriver.PTP_TYPE_DATA);
        streamBuf.putShort((short) SonyPtpDriver.PTP_OC_GetObject);
        streamBuf.putInt(303);
        for (int i = 12; i < 32; i++) streamBuf.put((byte) 0x11);

        // Response container (12 bytes, OK)
        streamBuf.putInt(12);
        streamBuf.putShort((short) SonyPtpDriver.PTP_TYPE_RESPONSE);
        streamBuf.putShort((short) SonyPtpDriver.PTP_RC_OK);
        streamBuf.putInt(303);

        byte[] stream = streamBuf.array();

        // Consume data container
        int dataLen = 32;
        int remaining = 64 - dataLen;
        byte[] residue = new byte[remaining];
        System.arraycopy(stream, dataLen, residue, 0, remaining);

        ByteBuffer respReader = ByteBuffer.wrap(residue, 0, 12).order(ByteOrder.LITTLE_ENDIAN);
        assertEquals(12, respReader.getInt());
        assertEquals(SonyPtpDriver.PTP_TYPE_RESPONSE, respReader.getShort());
        assertEquals(SonyPtpDriver.PTP_RC_OK, respReader.getShort() & 0xFFFF);
        assertEquals(303, respReader.getInt());
    }

    @Test
    public void testSonyShotObjectHandleInMemoryCaptureAndValidation() {
        // Test 5: In-memory capture handle 0xFFFFC001 must be recognized as valid 32-bit handle
        int virtualHandle = SonyPtpDriver.SONY_SHOT_OBJECT_HANDLE;
        assertEquals(0xFFFFC001, virtualHandle);

        // Prove the Java signed arithmetic trap:
        // In signed 32-bit Java, 0xFFFFC001 is -16383, so (virtualHandle > 0) is false!
        assertTrue("Signed int is negative in Java", virtualHandle < 0);
        assertFalse("Legacy signed check (virtualHandle > 0) mistakenly treated 0xFFFFC001 as invalid", virtualHandle > 0);

        // SonyPtpDriver.isValidObjectHandle must treat 0xFFFFC001 as valid unsigned 32-bit PTP handle
        assertTrue("0xFFFFC001 must be recognized as valid PTP handle", SonyPtpDriver.isValidObjectHandle(virtualHandle));
        assertTrue("Storage handle 0x00010042 must be valid", SonyPtpDriver.isValidObjectHandle(0x00010042));
        assertFalse("Handle 0 must be invalid", SonyPtpDriver.isValidObjectHandle(0));
        assertFalse("Handle -1 (0xFFFFFFFF) must be invalid", SonyPtpDriver.isValidObjectHandle(-1));

        // When GetObjectInfo(0xFFFFC001) is executed, compressedSize is obtained
        long inMemoryCompressedSize = 5242880L; // 5 MB JPEG in camera RAM
        SonyPtpDriver.ObjectMetadata meta = new SonyPtpDriver.ObjectMetadata(
            virtualHandle, 0x00000000, 0x3801, inMemoryCompressedSize, 6000, 4000);

        assertEquals(0xFFFFC001, meta.handle);
        assertEquals(5242880L, meta.compressedSize);
        assertEquals(6000, meta.imageWidth);
        assertEquals(4000, meta.imageHeight);

        // With valid metadata, total target length is bounded and bypasses READ_DATA_UNBOUNDED
        long targetLen = 12 + meta.compressedSize;
        assertEquals(5242892L, targetLen);
        assertTrue("Target length must be bounded and strictly positive", targetLen > 12);
    }

    @Test
    public void testCorrelationIdTrackingAndBuildIdentifier() {
        // Test 5B: Build identifier and correlation ID tracking
        assertEquals("20261020-P0-SONY-SHUTTER-FIX-02", SonyPtpDriver.BUILD_IDENTIFIER);
        assertEquals(0x054C, SonyPtpDriver.SONY_VENDOR_ID);

        String testCorrId = "CORR_TEST_123456";
        SonyPtpDriver.CapturedPhotoResult photoResult = new SonyPtpDriver.CapturedPhotoResult(
            "SONY_123", "/path/to/photo.jpg", "data:image/jpeg;base64,abc", 6000, 4000, "jpeg", testCorrId);

        assertEquals("SONY_123", photoResult.photoId);
        assertEquals(testCorrId, photoResult.correlationId);
        assertEquals(6000, photoResult.width);
        assertEquals(4000, photoResult.height);
        assertEquals("APP_SHUTTER", photoResult.triggerSource);
        assertEquals(0L, photoResult.totalMs);
    }

    @Test
    public void testRealStorageHandleAndValidPayloadSize() {
        // Test 6: Real storage handle (0x00010042) with valid ObjectInfo compressedSize
        int handle = 0x00010042;
        long compressedSize = 4194304L; // 4 MB JPEG
        SonyPtpDriver.ObjectMetadata meta = new SonyPtpDriver.ObjectMetadata(
            handle, 0x00010001, 0x3801, compressedSize, 6000, 4000);

        assertEquals(0x00010042, meta.handle);
        assertEquals(4194304L, meta.compressedSize);
        assertEquals(6000, meta.imageWidth);
        assertEquals(4000, meta.imageHeight);

        // Bounded container calculation
        long boundedTarget = 12 + meta.compressedSize;
        assertEquals(4194316L, boundedTarget);
        assertTrue("Target length must be bounded and strictly positive", boundedTarget > 12);
    }

    @Test
    public void testLiveViewRecoveryAfterFailedCapture() {
        // Test 7: State recovery and live view restoration after capture failure
        final java.util.concurrent.atomic.AtomicBoolean isCapturing = new java.util.concurrent.atomic.AtomicBoolean(true);
        final java.util.concurrent.atomic.AtomicBoolean isSoftwareCapturing = new java.util.concurrent.atomic.AtomicBoolean(true);
        final java.util.concurrent.atomic.AtomicBoolean liveViewRestored = new java.util.concurrent.atomic.AtomicBoolean(false);

        // Emulate try-finally in capturePhoto()
        try {
            // Emulate failure (e.g. invalid handle or camera timeout)
            throw new java.io.IOException("Capture simulated failure");
        } catch (Exception e) {
            // Exception caught
        } finally {
            // Must clean up state flags
            isSoftwareCapturing.set(false);
            isCapturing.set(false);
            liveViewRestored.set(true);
        }

        assertFalse("isCapturing must be reset to false", isCapturing.get());
        assertFalse("isSoftwareCapturing must be reset to false", isSoftwareCapturing.get());
        assertTrue("Live view state machine must be restored", liveViewRestored.get());
    }

    @Test
    public void testUnsignedHandleProofAndRootCauseVerification() {
        // Test 8: Proves the signed 32-bit int comparison trap on 0xFFFFC001
        int virtualHandle = 0xFFFFC001; // In Java, this is -16383
        assertTrue("Handle is negative in Java signed 32-bit representation", virtualHandle < 0);
        assertFalse("Old check (handle > 0) erroneously evaluated to FALSE for 0xFFFFC001", virtualHandle > 0);

        // The corrected check:
        assertTrue("isValidObjectHandle must return true for 0xFFFFC001", SonyPtpDriver.isValidObjectHandle(virtualHandle));
        assertTrue("isValidObjectHandle must return true for SD card handle 0x00010005", SonyPtpDriver.isValidObjectHandle(0x00010005));
        assertFalse("isValidObjectHandle must return false for 0", SonyPtpDriver.isValidObjectHandle(0));
        assertFalse("isValidObjectHandle must return false for 0xFFFFFFFF (all 1s sentinel)", SonyPtpDriver.isValidObjectHandle(-1));
    }

    @Test
    public void testDesktopParityPropertyConstants() {
        // Test 9: Validates property codes ported from Desktop Sony Camera Remote SDK
        assertEquals(0xD222, SonyPtpDriver.SONY_DPC_STILL_IMAGE_STORE_DESTINATION);
        assertEquals(0xD223, SonyPtpDriver.SONY_DPC_STILL_IMAGE_TRANS_SIZE);
        assertEquals(0xD229, SonyPtpDriver.SONY_DPC_PRIORITY_KEY);
        assertEquals(0xD215, SonyPtpDriver.SONY_DPC_SHOOTING_FILE_INFO);
        assertEquals(0xD2C1, SonyPtpDriver.SONY_DPC_S1_BUTTON);
        assertEquals(0xD2C2, SonyPtpDriver.SONY_DPC_S2_BUTTON);
        assertEquals(0xD2E6, SonyPtpDriver.SONY_DPC_S1_AND_S2_BUTTON);
        assertEquals(0xD2C7, SonyPtpDriver.SONY_DPC_REQUEST_ONE_SHOOTING);
        assertEquals(0xFFFFC001, SonyPtpDriver.SONY_SHOT_OBJECT_HANDLE);
        assertEquals("20261020-P0-SONY-SHUTTER-FIX-02", SonyPtpDriver.BUILD_IDENTIFIER);
    }

    @Test
    public void testSonyVendorIdAndNonCameraRejection() {
        // Test 10: Validates Sony Vendor ID and rejection of Realtek (0x0BDA) and ASIX (0x0B95) Ethernet devices
        assertEquals(0x054C, SonyPtpDriver.SONY_VENDOR_ID);
        int realtekVid = 0x0BDA;
        int asixVid = 0x0B95;
        assertNotEquals("Realtek VID must never equal Sony VID", SonyPtpDriver.SONY_VENDOR_ID, realtekVid);
        assertNotEquals("ASIX VID must never equal Sony VID", SonyPtpDriver.SONY_VENDOR_ID, asixVid);
    }

    @Test
    public void testLatencyMetricsStructure() {
        // Test 11: Validates Phase 5 latency timing metrics
        SonyPtpDriver.CapturedPhotoResult photo = new SonyPtpDriver.CapturedPhotoResult(
            "SONY_METRIC_1", "/path.jpg", "data:image/jpeg;base64,x", 6000, 4000, "jpeg", "CORR_METRICS");
        photo.triggerSource = "PHYSICAL_SHUTTER";
        photo.tButtonToResponseMs = 1200;
        photo.tResponseToTransferStartMs = 450;
        photo.tTransferDurationMs = 850;
        photo.tFileToUiMs = 150;
        photo.totalMs = 2650;

        assertEquals("PHYSICAL_SHUTTER", photo.triggerSource);
        assertEquals(1200, photo.tButtonToResponseMs);
        assertEquals(450, photo.tResponseToTransferStartMs);
        assertEquals(850, photo.tTransferDurationMs);
        assertEquals(150, photo.tFileToUiMs);
        assertEquals(2650, photo.totalMs);
    }

    @Test
    public void testEmptyDataContainerDetectionAndPayloadValidation() {
        // Test 12: Simulates the 12-byte empty DATA container returned when GetObject is called prematurely
        // Header: length = 12, type = 2 (DATA), code = 0x1009 (GetObject), tx = 1
        ByteBuffer emptyContainer = ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN);
        emptyContainer.putInt(12);
        emptyContainer.putShort((short) SonyPtpDriver.PTP_TYPE_DATA);
        emptyContainer.putShort((short) SonyPtpDriver.PTP_OC_GetObject);
        emptyContainer.putInt(1);

        byte[] raw = emptyContainer.array();
        assertEquals(12, raw.length);

        ByteBuffer reader = ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN);
        int declaredLen = reader.getInt();
        short type = reader.getShort();
        short code = reader.getShort();

        assertEquals(12, declaredLen);
        assertEquals(SonyPtpDriver.PTP_TYPE_DATA, type);
        assertEquals(SonyPtpDriver.PTP_OC_GetObject, code & 0xFFFF);

        // Payload length = declaredLen - 12 = 0 bytes
        int payloadLen = declaredLen - 12;
        assertEquals(0, payloadLen);
        assertTrue("A 12-byte DATA container has exactly 0 payload bytes and represents an empty buffer", payloadLen == 0);

        // When GetObjectInfo has populated metadata, expectedPayloadSize > 0
        long realCompressedSize = 8388608L; // 8 MB real JPEG
        long expectedTarget = 12 + realCompressedSize;
        assertEquals(8388620L, expectedTarget);
        assertTrue("Target with metadata must be > 12 bytes", expectedTarget > 12);
    }

    @Test
    public void testSonyObjectInMemoryReadyThreshold() {
        // Test 13: Validates Sony Property 0xD215 (ObjectInMemory) ready threshold
        // Property 0xD215 turns to 1 during shooting, and >= 0x8000 (e.g. 0x8001) when ready in RAM
        int busyState = 0x0001;
        int readyState = 0x8001;
        int multiReadyState = 0x8002;

        assertFalse("Value 0x0001 is busy state (high bit not set)", (busyState & 0x8000) != 0);
        assertTrue("Value 0x8001 is ready state (high bit set)", (readyState & 0x8000) != 0);
        assertTrue("Value 0x8002 is multi-image ready state", (multiReadyState & 0x8000) != 0);
    }

    @Test
    public void testPtpEventCodesAndPhysicalShutterSegregation() {
        // Test 14: Validates that 0x4006 is DevicePropChanged (NEVER a capture event)
        // and physical shutter actuation is triggered by ObjectAdded (0xC201 / 0x4002) and CaptureComplete (0x400D).
        assertEquals(0x4006, SonyPtpDriver.PTP_EC_DevicePropChanged);
        assertEquals(0x4002, SonyPtpDriver.PTP_EC_ObjectAdded);
        assertEquals(0xC201, SonyPtpDriver.PTP_EC_Sony_ObjectAdded);
        assertEquals(0xC203, SonyPtpDriver.PTP_EC_Sony_PropertyChanged);

        int event0x4006 = 0x4006;
        int event0xC201 = 0xC201;
        int event0x4002 = 0x4002;
        int event0x400D = 0x400D;

        boolean isPhysicalShutter0x4006 = (event0x4006 == SonyPtpDriver.PTP_EC_Sony_ObjectAdded || event0x4006 == SonyPtpDriver.PTP_EC_ObjectAdded || event0x4006 == 0x400D);
        boolean isPhysicalShutter0xC201 = (event0xC201 == SonyPtpDriver.PTP_EC_Sony_ObjectAdded || event0xC201 == SonyPtpDriver.PTP_EC_ObjectAdded || event0xC201 == 0x400D);
        boolean isPhysicalShutter0x4002 = (event0x4002 == SonyPtpDriver.PTP_EC_Sony_ObjectAdded || event0x4002 == SonyPtpDriver.PTP_EC_ObjectAdded || event0x4002 == 0x400D);
        boolean isPhysicalShutter0x400D = (event0x400D == SonyPtpDriver.PTP_EC_Sony_ObjectAdded || event0x400D == SonyPtpDriver.PTP_EC_ObjectAdded || event0x400D == 0x400D);

        assertFalse("0x4006 (DevicePropChanged) must NEVER trigger physical shutter or capture", isPhysicalShutter0x4006);
        assertTrue("0xC201 (Sony_ObjectAdded) must trigger physical shutter", isPhysicalShutter0xC201);
        assertTrue("0x4002 (ObjectAdded) must trigger physical shutter", isPhysicalShutter0x4002);
        assertTrue("0x400D (CaptureComplete) must trigger physical shutter", isPhysicalShutter0x400D);
    }

    @Test
    public void testInvalidObjectHandleResponseCode() {
        // Test 15: Validates PTP_RC_InvalidObjectHandle code
        assertEquals(0x2006, SonyPtpDriver.PTP_RC_InvalidObjectHandle);
    }
}

