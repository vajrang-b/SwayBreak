# SwayBreak

## Automatic game and webcam recording

Enable posture control and grant camera access to start the game. The browser
also asks for microphone access before play starts; if microphone access is
denied, the game records without microphone audio. Recordings match your actual gameplay view (landscape on laptop, portrait on
mobile). In AR mode, the live mirrored camera background is composited behind the
game field and audio, capturing exactly what you saw while playing. In standard mode,
a picture-in-picture preview of your posture skeleton is recorded.
Recording stops when the round ends or posture control is disabled. By default,
the video and event markers are saved in the browser's local recordings library.
Open **My recordings** to review them, download individual files, or export all
recordings and event markers in one ZIP. On iPhone and iPad, use the share sheet
to save the ZIP to Files. You can turn off automatic saving in the game or
recordings page; the **Save video** button remains available for the latest
recording. Recordings are stored only in this browser on this device, not
uploaded, and may be removed if site data is cleared. Microphone capture stops
when posture control is disabled.

When posture control is active, **Camera background (AR)** places the live
camera behind the transparent game field so bricks and game effects appear
over the camera view. Turn it off to return to the standard game background.

Use **⛶ Full screen** (or press **F**) to expand the AR camera view to fill your entire
display or TV for an immersive exergame workout. When posture play begins, the game
automatically transitions to full screen so you can immediately step back and play.
Press **Esc** or click **✕ Exit full screen** at any time to return to windowed mode.

Clearing all bricks advances to the next level after a five-second countdown.
Your score, round timer, and video recording continue across successful levels.

During game sounds, microphone audio in the recording is briefly ducked to
reduce speaker echo, then restored. Headphones are still the most reliable way
to prevent game audio from leaking into the microphone. The recording mic level
can be set with `audio.setRecordingMicLevel(0)` for game audio only or
`audio.setRecordingMicLevel(0.6)` for reduced microphone audio.

Sound effects are stored in `sounds/`. When the ball drops, the game plays
`sounds/miss-explosion.mp3`, then animates it back to the paddle
with a return swoosh and catch sound. If the audio file cannot load, a
synthesized blast is used instead. Smashes also play the supplied
`sounds/fahhh_KcgAXfs.mp3` vocal cue along with the existing impact sound.

## Rounds, combos, and best scores

Clear bricks without missing to build a combo: streaks of 3, 5, and 10 award
extra points. The ball speeds up by 5% for every 10 bricks cleared. Rounds
alternate between the full grid and a diamond brick layout. Your best score is
saved in this browser, and the end screen offers a challenge link that tells
others which score to beat in 90 seconds.
The normal mode keeps unlimited misses.

When clutch saves or SMASHes happen, a companion `.events.json` file lists
their timestamps in seconds and milliseconds for editing.

## Serve the game over HTTPS on your local network

The page can be served over HTTPS for devices connected to the same local
network. This uses a self-signed certificate, so browsers will show a
certificate warning unless you explicitly trust that certificate.

From this directory, generate a temporary certificate and key:

```sh
mkdir -p .https
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout .https/localhost.key \
  -out .https/localhost.crt \
  -days 3 \
  -subj '/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
```

Start the HTTPS server:

```sh
python3 -c 'import http.server, ssl; server = http.server.ThreadingHTTPServer(("0.0.0.0", 8443), http.server.SimpleHTTPRequestHandler); context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); context.load_cert_chain(".https/localhost.crt", ".https/localhost.key"); server.socket = context.wrap_socket(server.socket, server_side=True); print("Serving HTTPS on port 8443", flush=True); server.serve_forever()'
```

Keep that terminal open while using the page. On the serving computer, find its
LAN IP address (on Linux, run `hostname -I`). Then, on another device on the
same network, visit:

```text
https://<server-lan-ip>:8443
```

For example, if the server's LAN IP is `10.0.0.104`, open
`https://10.0.0.104:8443`. Accept the browser's certificate warning only if
you trust the computer and network. The certificate above is for `localhost`,
so it will not match the LAN IP; do not enter sensitive information through
this preview.

If the page cannot be reached, check that both devices are on the same network,
that the network permits device-to-device connections, and that the server's
firewall permits inbound TCP connections on port `8443`. The server binds to
all network interfaces, so only run it on a trusted network. Stop it with
`Ctrl+C`. The LAN IP can change when the computer reconnects to the network.

## Running Unit Tests

Unit tests use Node.js's built-in test runner (`node:test` and `node:assert/strict`) with browser environment mocks for Web Audio, MediaRecorder, IndexedDB, MediaPipe Vision, and HTML5 Canvas.

Run the complete test suite:

```sh
npm test
```
