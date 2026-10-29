# Weight Loss Games

## Automatic game and webcam recording

Enable posture control to record a portrait video with the game at the top and
the camera with its skeleton overlay at the bottom. Game sound and microphone
audio are included; the browser asks for microphone permission separately.
If microphone access is denied or unavailable, recording continues without it.
Recording stops when the round ends or posture control is disabled, then
downloads to your device as a WebM or MP4 file. The video is composed and saved
locally in your browser; it is not uploaded. Microphone capture stops when
posture control is disabled.
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
