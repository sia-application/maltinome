// worker.js
// Handles the timer loop in a separate thread to avoid main thread throttling

let timerID = null;
let interval = 25; // 25ms

self.onmessage = function (e) {
    if (e.data === "start") {
        if (timerID) clearInterval(timerID);
        timerID = setInterval(function () {
            postMessage("tick");
        }, interval);
    } else if (e.data === "stop") {
        clearInterval(timerID);
        timerID = null;
    } else if (e.data.interval) {
        interval = e.data.interval;
        if (timerID) {
            clearInterval(timerID);
            timerID = setInterval(function () {
                postMessage("tick");
            }, interval);
        }
    }
};
