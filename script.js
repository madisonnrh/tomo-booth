/* global Promise */
"use strict";

var welcomeScreen = document.getElementById("welcome");
var cameraScreen = document.getElementById("camera-screen");
var resultsScreen = document.getElementById("results");
var startButton = document.getElementById("start-button");
var restartButton = document.getElementById("restart");
var video = document.getElementById("video");
var countdown = document.getElementById("countdown");
var flash = document.getElementById("flash");
var filmGrain = document.getElementById("film-grain");
var setupControls = document.getElementById("setup-controls");
var setupHelp = document.getElementById("setup-help");
var readyButton = document.getElementById("ready-button");
var filterToggle = document.getElementById("filter-toggle");
var photoStatus = document.getElementById("photo-status");
var welcomeHelp = document.getElementById("welcome-help");
var cameraHelp = document.getElementById("camera-help");
var strip1x4 = document.getElementById("strip-1x4");
var strip2x4 = document.getElementById("strip-2x4");
var photoCanvas = document.getElementById("photo-canvas");
var canvas1x4 = document.getElementById("strip-canvas-1x4");
var canvas2x4 = document.getElementById("strip-canvas-2x4");
var printImage = document.getElementById("print-image");
var printImageContent = document.getElementById("print-image-content");
var download1x4 = document.getElementById("download-1x4");
var download2x4 = document.getElementById("download-2x4");
var print2x4 = document.getElementById("print-2x4");

var stream = null;
var photos = [];
var isTakingPhotos = false;
var selectedFilter = "color";

var TOTAL_PHOTOS = 4;
var COUNTDOWN_SECONDS = 3;

function showScreen(screenToShow) {
    [welcomeScreen, cameraScreen, resultsScreen].forEach(function (screen) {
        screen.classList.toggle("active", screen === screenToShow);
    });
}

function setMessage(element, message, isError) {
    if (typeof isError === "undefined") {
        isError = false;
    }

    element.textContent = message;
    element.classList.toggle("error", isError);
}

function wait(milliseconds) {
    return new Promise(function (resolve) {
        window.setTimeout(resolve, milliseconds);
    });
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(function (track) {
            track.stop();
        });
        stream = null;
    }

    video.srcObject = null;
}

function setSelectedFilter(filter) {
    var isBlackAndWhite = filter === "bw";
    selectedFilter = filter;

    video.classList.toggle("filter-bw", isBlackAndWhite);
    video.classList.toggle("filter-color", !isBlackAndWhite);
    filmGrain.classList.add("active");
    filterToggle.classList.toggle("flipped", isBlackAndWhite);
    filterToggle.setAttribute("aria-pressed", String(isBlackAndWhite));
    filterToggle.setAttribute(
        "aria-label",
        isBlackAndWhite ? "Switch to color" : "Switch to black and white"
    );
}

function cameraUnavailableMessage(error) {
    var hostname = location.hostname;
    var localHost =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1";

    if (!window.isSecureContext && !localHost) {
        return "Safari blocks camera access when this file is opened directly. Open it from an HTTPS website or from http://localhost.";
    }

    if (
        error &&
        (error.name === "NotAllowedError" ||
            error.name === "PermissionDeniedError")
    ) {
        return "Camera access was blocked. In Safari, choose Safari > Settings for This Website > Camera > Allow, then reload this page.";
    }

    if (
        error &&
        (error.name === "NotFoundError" ||
            error.name === "DevicesNotFoundError")
    ) {
        return "No camera was found. Connect a camera and try again.";
    }

    if (error && error.name === "NotReadableError") {
        return "The camera is already being used by another app. Close that app and try again.";
    }

    return "Safari could not start the camera. Check the camera permission for this website and try again.";
}

function checkCameraEnvironment() {
    var hasCameraApi = Boolean(
        navigator.mediaDevices &&
            typeof navigator.mediaDevices.getUserMedia === "function"
    );
    var hostname = location.hostname;
    var localHost =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1";

    if (!hasCameraApi) {
        setMessage(
            welcomeHelp,
            "This browser does not expose camera access. Try the latest Safari, Chrome, or Firefox.",
            true
        );
        return false;
    }

    if (!window.isSecureContext && !localHost) {
        setMessage(
            welcomeHelp,
            "For Safari to use the camera, open this page from HTTPS or http://localhost instead of opening the HTML file directly.",
            true
        );
    }

    return true;
}

function startCamera() {
    if (!checkCameraEnvironment()) {
        return Promise.resolve(false);
    }

    return navigator.mediaDevices
        .getUserMedia({
            audio: false,
            video: {
                facingMode: { ideal: "user" },
                width: { ideal: 1280 },
                height: { ideal: 960 }
            }
        })
        .then(function (newStream) {
            stream = newStream;
            video.srcObject = stream;
            return Promise.resolve(video.play());
        })
        .then(function () {
            return true;
        })
        .catch(function (error) {
            stopCamera();
            setMessage(welcomeHelp, cameraUnavailableMessage(error), true);
            return false;
        });
}

function runCountdown(photoNumber) {
    var seconds;
    var sequence = Promise.resolve();

    photoStatus.textContent = "PHOTO " + photoNumber + " OF " + TOTAL_PHOTOS;

    for (seconds = COUNTDOWN_SECONDS; seconds > 0; seconds -= 1) {
        (function (count) {
            sequence = sequence.then(function () {
                countdown.textContent = count;
                countdown.classList.add("show");
                return wait(1000);
            });
        })(seconds);
    }

    return sequence.then(function () {
        countdown.classList.remove("show");
        flash.classList.remove("active");
        void flash.offsetWidth;
        flash.classList.add("active");
        return wait(80);
    });
}

function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function applyAnalogBlackAndWhite(context, width, height) {
    // Blend a lower-resolution copy before adding grain: softer detail with
    // crisp film texture, including browsers without canvas blur support.
    var softCanvas = document.createElement("canvas");
    softCanvas.width = Math.max(1, Math.round(width * 0.4));
    softCanvas.height = Math.max(1, Math.round(height * 0.4));
    var softContext = softCanvas.getContext("2d");
    if (softContext) {
        softContext.drawImage(context.canvas, 0, 0, softCanvas.width, softCanvas.height);
        context.save();
        context.imageSmoothingEnabled = true;
        context.globalAlpha = 0.55;
        context.drawImage(softCanvas, 0, 0, width, height);
        context.restore();
    }
    var imageData = context.getImageData(0, 0, width, height);
    var pixels = imageData.data;
    var index;
    var pixel;
    var x;
    var y;
    var red;
    var green;
    var blue;
    var luminance;
    var normalized;
    var curved;
    var grain;
    var grainHash;
    var grainFraction;
    var horizontal;
    var vertical;
    var distanceFromCenter;
    var vignette;
    var tone;

    for (index = 0; index < pixels.length; index += 4) {
        pixel = index / 4;
        x = pixel % width;
        y = Math.floor(pixel / width);
        red = pixels[index];
        green = pixels[index + 1];
        blue = pixels[index + 2];
        // A slightly red-sensitive mix keeps skin luminous, like classic
        // panchromatic booth film, without washing out facial detail.
        luminance = red * 0.34 + green * 0.56 + blue * 0.10;
        normalized = luminance / 255;

        // A gentle film-like S curve: rich blacks, soft highlights, and
        // retained midtone detail instead of a harsh grayscale conversion.
        curved = 1 / (1 + Math.exp(-5.35 * (normalized - 0.5)));
        curved = (curved - 0.0647) / 0.8706;
        tone = Math.max(0, Math.min(1, curved));
        // Pull the exposure down slightly so the finished print feels denser.
        tone = Math.pow(tone, 0.98) * 255 * 0.89;

        // Fine monochrome grain. The coordinate hash makes it consistent
        // across all three channels, so it resembles film rather than color noise.
        grainHash = Math.sin(Math.floor(x / 1.5) * 12.9898 + Math.floor(y / 1.5) * 78.233) * 43758.5453;
        grainFraction = grainHash - Math.floor(grainHash);
        // Grain is most visible in midtones, with a quieter paper texture in
        // highlights and shadows rather than uniform digital noise.
        grain = (grainFraction - 0.5) * (10 + 22 * Math.sin(normalized * Math.PI));
        horizontal = x / width - 0.5;
        vertical = y / height - 0.5;
        distanceFromCenter = Math.sqrt(
            horizontal * horizontal + vertical * vertical
        );
        vignette = Math.max(
            0.88,
            1 - Math.max(0, distanceFromCenter - 0.32) * 0.28
        );
        // Broad, faint density variation imitates an uneven developed print.
        tone = tone * vignette + grain +
            2.5 * Math.sin(x / width * 17 + y / height * 4) +
            1.5 * Math.sin(y / height * 27);

        // Restrained brown-gray midtones and ivory highlights, without the
        // strong yellow cast of traditional sepia.
        normalized = Math.max(0, Math.min(1, tone / 255));
        if (normalized < 0.5) {
            curved = normalized * 2;
            pixels[index] = clampByte(14 + curved * 121);
            pixels[index + 1] = clampByte(11 + curved * 113);
            pixels[index + 2] = clampByte(10 + curved * 105);
        } else {
            curved = (normalized - 0.5) * 2;
            pixels[index] = clampByte(135 + curved * 114);
            pixels[index + 1] = clampByte(124 + curved * 117);
            pixels[index + 2] = clampByte(115 + curved * 114);
        }
    }

    context.putImageData(imageData, 0, 0);
}

function applyAnalogColor(context, width, height) {
    var imageData = context.getImageData(0, 0, width, height);
    var pixels = imageData.data;
    var index;
    var pixel;
    var x;
    var y;
    var red;
    var green;
    var blue;
    var luminance;
    var mutedRed;
    var mutedGreen;
    var mutedBlue;
    var shadowWeight;
    var highlightWeight;
    var horizontal;
    var vertical;
    var distanceFromCenter;
    var vignette;
    var grainHash;
    var grainFraction;
    var grain;
    var diffusionCanvas;
    var diffusionContext;

    for (index = 0; index < pixels.length; index += 4) {
        pixel = index / 4;
        x = pixel % width;
        y = Math.floor(pixel / width);
        red = pixels[index];
        green = pixels[index + 1];
        blue = pixels[index + 2];
        luminance = red * 0.299 + green * 0.587 + blue * 0.114;

        // Keep the analog palette, but retain richer color than the previous
        // muted treatment. Red gets the strongest response for a rosy print.
        mutedRed = luminance + (red - luminance) * 1.04;
        mutedGreen = luminance + (green - luminance) * 0.96;
        mutedBlue = luminance + (blue - luminance) * 0.92;

        // Darker exposure and a punchier print curve. The offset keeps the
        // deepest blacks from looking perfectly digital and empty.
        mutedRed = (mutedRed - 128) * 1.08 + 113;
        mutedGreen = (mutedGreen - 128) * 1.06 + 111;
        mutedBlue = (mutedBlue - 128) * 1.02 + 108;

        shadowWeight = Math.max(0, 1 - luminance / 150);
        highlightWeight = Math.max(0, (luminance - 120) / 135);

        // A restrained pink cast warms skin and highlights without turning
        // neutral backgrounds fully red.
        mutedRed += 13 + highlightWeight * 22 - shadowWeight;
        mutedGreen += highlightWeight * 2 - 2;
        mutedBlue += shadowWeight * 10 - highlightWeight * 9;

        horizontal = x / width - 0.5;
        vertical = y / height - 0.5;
        distanceFromCenter = Math.sqrt(
            horizontal * horizontal + vertical * vertical
        );
        vignette = Math.max(
            0.8,
            1 - Math.max(0, distanceFromCenter - 0.26) * 0.48
        );

        // Visible but channel-matched grain reads as film texture rather than
        // colored digital noise.
        grainHash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        grainFraction = grainHash - Math.floor(grainHash);
        grain = (grainFraction - 0.5) * 18;

        pixels[index] = clampByte(mutedRed * vignette + grain);
        pixels[index + 1] = clampByte(mutedGreen * vignette + grain);
        pixels[index + 2] = clampByte(mutedBlue * vignette + grain);
    }

    context.putImageData(imageData, 0, 0);

    // Re-layer a softened copy to imitate diffusion glass and gentle instant-
    // film halation. The original grain remains crisp underneath this bloom.
    diffusionCanvas = document.createElement("canvas");
    diffusionCanvas.width = width;
    diffusionCanvas.height = height;
    diffusionContext = diffusionCanvas.getContext("2d");

    if (diffusionContext) {
        diffusionContext.drawImage(context.canvas, 0, 0);

        context.save();
        context.globalAlpha = 0.22;
        context.filter = "blur(1.4px)";
        context.drawImage(diffusionCanvas, 0, 0);
        context.restore();

        context.save();
        context.globalCompositeOperation = "screen";
        context.globalAlpha = 0.12;
        context.filter = "blur(7px)";
        context.drawImage(diffusionCanvas, 0, 0);
        context.restore();
    }
}

function capturePhoto() {
    var width = video.videoWidth || 1280;
    var height = video.videoHeight || 960;
    var context;

    photoCanvas.width = width;
    photoCanvas.height = height;
    context = photoCanvas.getContext("2d");

    if (!context) {
        throw new Error("Canvas is not available in this browser.");
    }

    context.save();
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, width, height);
    context.restore();

    if (selectedFilter === "bw") {
        applyAnalogBlackAndWhite(context, width, height);
    } else {
        applyAnalogColor(context, width, height);
    }

    return photoCanvas.toDataURL("image/jpeg", 0.92);
}

function drawPhotoCover(context, source, x, y, width, height) {
    var sourceRatio = source.width / source.height;
    var targetRatio = width / height;
    var sourceWidth = source.width;
    var sourceHeight = source.height;
    var sourceX = 0;
    var sourceY = 0;

    if (sourceRatio > targetRatio) {
        sourceWidth = source.height * targetRatio;
        sourceX = (source.width - sourceWidth) / 2;
    } else {
        sourceHeight = source.width / targetRatio;
        sourceY = (source.height - sourceHeight) / 2;
    }

    context.drawImage(
        source,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        x,
        y,
        width,
        height
    );
}

function loadImage(dataUrl) {
    return new Promise(function (resolve, reject) {
        var image = new Image();
        image.onload = function () {
            resolve(image);
        };
        image.onerror = function () {
            reject(new Error("A captured photo could not be loaded."));
        };
        image.src = dataUrl;
    });
}

function makeStrip(canvas, width, height, columns) {
    var context;
    var images;
    var photoWidth;
    var photoHeight;
    var outerBorder = 10;
    var divider = 28;

    if (typeof columns === "undefined") {
        columns = 1;
    }

    canvas.width = width;
    canvas.height = height;
    context = canvas.getContext("2d");

    if (!context) {
        throw new Error("Canvas is not available in this browser.");
    }

    // Color prints use near-white cream paper; BW keeps its dark film edge.
    context.fillStyle = selectedFilter === "bw" ? "#111111" : "#faf5ec";
    context.fillRect(0, 0, width, height);

    return Promise.all(photos.map(loadImage)).then(function (loadedImages) {
        images = loadedImages;
        photoWidth = width / columns;
        photoHeight =
            (height - outerBorder * 2 - divider * (TOTAL_PHOTOS - 1)) /
            TOTAL_PHOTOS;

        images.forEach(function (image, index) {
            var column;

            for (column = 0; column < columns; column += 1) {
                context.save();
                traceAnalogFrame(context,
                    column * photoWidth + outerBorder,
                    outerBorder + index * (photoHeight + divider),
                    photoWidth - outerBorder * 2, photoHeight, index);
                context.clip();
                drawPhotoCover(
                    context,
                    image,
                    column * photoWidth + outerBorder,
                    outerBorder + index * (photoHeight + divider),
                    photoWidth - outerBorder * 2,
                    photoHeight
                );
                    // Feather each image into the surrounding paper color.
                    context.strokeStyle = selectedFilter === "bw" ?
                        "rgba(17,17,17,0.12)" : "rgba(250,245,236,0.12)";
                    context.lineWidth = 8;
                    context.stroke();
                    context.strokeStyle = selectedFilter === "bw" ?
                        "rgba(17,17,17,0.20)" : "rgba(250,245,236,0.20)";
                    context.lineWidth = 3;
                    context.stroke();
                context.restore();
            }
        });

        addWornPrintTexture(context, width, height, columns, outerBorder, selectedFilter !== "bw");
        return canvas.toDataURL("image/jpeg", 0.94);
    });
}

function traceAnalogFrame(context, x, y, width, height, photoIndex) {
    // Small variations stay inside the original frame, preserving the crop
    // ratio and dividers. The same photo has the same mask in both exports.
    var scale = width / 580;
    var radii = [5, 13, 3, 9];
    var radius = radii[photoIndex % radii.length] * scale;
    var phase = photoIndex * 2.17;
    var step;
    var t;
    function uneven(t, side) {
        return scale * (2 + 1.2 * Math.sin(t * 19 + phase + side) +
            0.7 * Math.sin(t * 43 + phase * 2 + side));
    }
    context.beginPath();
    context.moveTo(x + radius, y + uneven(0, 0));
    for (step = 1; step <= 30; step += 1) {
        t = step / 30;
        context.lineTo(x + radius + t * (width - radius * 2), y + uneven(t, 0));
    }
    context.quadraticCurveTo(x + width, y, x + width - uneven(0, 1), y + radius);
    for (step = 1; step <= 24; step += 1) {
        t = step / 24;
        context.lineTo(x + width - uneven(t, 1), y + radius + t * (height - radius * 2));
    }
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height - uneven(0, 2));
    for (step = 1; step <= 30; step += 1) {
        t = step / 30;
        context.lineTo(x + width - radius - t * (width - radius * 2), y + height - uneven(t, 2));
    }
    context.quadraticCurveTo(x, y + height, x + uneven(0, 3), y + height - radius);
    for (step = 1; step <= 24; step += 1) {
        t = step / 24;
        context.lineTo(x + uneven(t, 3), y + height - radius - t * (height - radius * 2));
    }
    context.quadraticCurveTo(x, y, x + radius, y + uneven(0, 0));
    context.closePath();
}

function addWornPrintTexture(context, width, height, columns, border, lightFrame) {
    // Procedural paper wear is baked into the export. Each duplicate uses
    // identical coordinates, so cutting the 4 x 6 sheet yields matching strips.
    var stripWidth = width / columns;
    var column;
    var i;
    var x;
    var y;
    var size;
    var seed = 731;
    function random() {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    }
    context.save();
    for (column = 0; column < columns; column += 1) {
        seed = 731;
        context.save();
        context.translate(column * stripWidth, 0);
        // Narrow, uneven cream abrasion inside the dark outer film edge.
        for (y = 0; y < height; y += 3) {
            context.fillStyle = (lightFrame ? "rgba(194,179,159," : "rgba(238,226,208,") +
                (0.18 + random() * 0.38) + ")";
            size = 1 + random() * border * 0.65;
            context.fillRect(0, y, size, 3);
            context.fillRect(stripWidth - size, y, size, 3);
        }
        // Fine paper flecks, mainly at the edges with sparse dust elsewhere.
        for (i = 0; i < 1900; i += 1) {
            y = random() * height;
            x = random() * stripWidth;
            if (i < 1500) {
                x = random() * 28;
                if (random() > 0.5) { x = stripWidth - x; }
            }
            size = 0.6 + random() * 1.8;
            context.fillStyle = random() > 0.25 ?
                "rgba(245,233,217,0.24)" : "rgba(35,26,22,0.17)";
            context.fillRect(x, y, size, size * (0.6 + random()));
        }
        // A handful of broken hairline scratches along the margins.
        context.strokeStyle = "rgba(241,228,209,0.16)";
        context.lineWidth = 0.7;
        for (i = 0; i < 9; i += 1) {
            x = border + 3 + random() * 20;
            if (i % 2) { x = stripWidth - x; }
            y = random() * height;
            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(x + random() * 2 - 1, Math.min(height, y + 40 + random() * 190));
            context.stroke();
        }
        context.restore();
    }
    context.restore();
}

function showResults() {
    // 300 pixels per printed inch: one 2 x 6 strip, or two on 4 x 6 paper.
    return makeStrip(canvas1x4, 600, 1800, 1).then(function (oneByFour) {
        return makeStrip(canvas2x4, 1200, 1800, 2).then(function (twoByFour) {
            strip1x4.src = oneByFour;
            strip2x4.src = twoByFour;
            printImageContent.src = twoByFour;
            printImage.style.display = "none";
            showScreen(resultsScreen);
        });
    });
}

function takePhotos() {
    var photoNumber;
    var sequence = Promise.resolve();

    isTakingPhotos = true;
    setMessage(cameraHelp, "Get ready. The next photo starts in 3 seconds.");

    for (photoNumber = 1; photoNumber <= TOTAL_PHOTOS; photoNumber += 1) {
        (function (number) {
            sequence = sequence
                .then(function () {
                    return runCountdown(number);
                })
                .then(function () {
                    photos.push(capturePhoto());
                    return wait(450);
                });
        })(photoNumber);
    }

    sequence
        .then(function () {
            stopCamera();
            return showResults();
        })
        .catch(function (error) {
            stopCamera();
            showScreen(welcomeScreen);
            setMessage(
                welcomeHelp,
                error && error.message
                    ? error.message
                    : "The photos could not be captured. Please try again.",
                true
            );
        })
        .then(function () {
            isTakingPhotos = false;
            startButton.disabled = false;
            readyButton.disabled = false;
            countdown.classList.remove("show");
        });
}

function beginSession() {
    if (isTakingPhotos) {
        return;
    }

    photos = [];
    setMessage(welcomeHelp, "");
    startButton.disabled = true;
    startButton.setAttribute("aria-label", "Opening camera");

    startCamera().then(function (cameraStarted) {
        if (!cameraStarted) {
            startButton.disabled = false;
            startButton.removeAttribute("aria-label");
            return;
        }

        showScreen(cameraScreen);
        cameraScreen.classList.remove("taking");
        setupControls.hidden = false;
        photoStatus.hidden = true;
        readyButton.disabled = false;
        setMessage(cameraHelp, "");
        setSelectedFilter("color");
        startButton.removeAttribute("aria-label");
    });
}

function beginPhotoSession() {
    if (!stream || isTakingPhotos) {
        return;
    }

    setupControls.hidden = true;
    photoStatus.hidden = false;
    cameraScreen.classList.add("taking");
    readyButton.disabled = true;
    setMessage(setupHelp, "");
    takePhotos();
}

function downloadImage(dataUrl, filename) {
    var link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function restart() {
    stopCamera();
    photos = [];
    setupControls.hidden = false;
    photoStatus.hidden = true;
    cameraScreen.classList.remove("taking");
    readyButton.disabled = false;
    setSelectedFilter("color");
    setMessage(welcomeHelp, "");
    setMessage(cameraHelp, "");
    setMessage(setupHelp, "");
    showScreen(welcomeScreen);
}

startButton.addEventListener("click", beginSession);
readyButton.addEventListener("click", beginPhotoSession);
filterToggle.addEventListener("click", function () {
    setSelectedFilter(selectedFilter === "color" ? "bw" : "color");
});
restartButton.addEventListener("click", restart);

download1x4.addEventListener("click", function () {
    if (strip1x4.src) {
        downloadImage(strip1x4.src, "photo-booth-1x4.jpg");
    }
});

download2x4.addEventListener("click", function () {
    if (strip2x4.src) {
        downloadImage(strip2x4.src, "photo-booth-2x4.jpg");
    }
});

print2x4.addEventListener("click", function () {
    if (!strip2x4.src) {
        return;
    }

    printImageContent.src = strip2x4.src;
    printImage.style.display = "block";
    window.setTimeout(function () {
        window.print();
        window.setTimeout(function () {
            printImage.style.display = "none";
        }, 250);
    }, 50);
});

window.addEventListener("pagehide", stopCamera);
checkCameraEnvironment();
