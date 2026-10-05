# Desk Hub static web server for Raspberry Pi Pico 2 W / MicroPython.
# Upload this file and the app files in the same directory on the Pico.

import json
import network
import socket
import time

from machine import ADC, Pin

from wifi_config import SSID, PASSWORD


# Files the browser is allowed to request from the Pico.
FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
    "/schedule.js": ("schedule.js", "application/javascript; charset=utf-8"),
    "/script.js": ("script.js", "application/javascript; charset=utf-8"),
    "/weather.js": ("weather.js", "application/javascript; charset=utf-8"),
    "/focus.js": ("focus.js", "application/javascript; charset=utf-8"),
    "/navigation.js": ("navigation.js", "application/javascript; charset=utf-8"),
    "/settings.js": ("settings.js", "application/javascript; charset=utf-8"),
    "/alarms.js": ("alarms.js", "application/javascript; charset=utf-8"),
}


# Potentiometer only: wiper to GP26 / ADC0; outer legs to 3V3 and GND.
POT_PIN = 26
potentiometer = None


def setup_physical_controls():
    global potentiometer
    try:
        potentiometer = ADC(Pin(POT_PIN))
        print("Potentiometer ready: ADC GP26")
    except Exception as error:
        potentiometer = None
        print("Potentiometer unavailable:", error)


def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)

    if not wlan.isconnected():
        print("Connecting to Wi-Fi...")
        wlan.connect(SSID, PASSWORD)
        started = time.time()
        while not wlan.isconnected():
            if time.time() - started > 45:
                raise RuntimeError("Wi-Fi connection timed out; check wifi_config.py")
            time.sleep(1)

    address = wlan.ifconfig()[0]
    print("Wi-Fi connected. Open http://" + address)
    return address


def send_all(client, data):
    view = memoryview(data)
    sent = 0
    while sent < len(view):
        count = client.send(view[sent:])
        if count <= 0:
            raise OSError("connection closed while sending")
        sent += count


def send_response(client, status, content_type, body):
    header = (
        "HTTP/1.1 " + status + "\r\n"
        "Content-Type: " + content_type + "\r\n"
        "Content-Length: " + str(len(body)) + "\r\n"
        "Cache-Control: no-store\r\n"
        "Connection: close\r\n"
        "X-Content-Type-Options: nosniff\r\n"
        "\r\n"
    ).encode("utf-8")
    send_all(client, header)
    for start in range(0, len(body), 1024):
        send_all(client, body[start:start + 1024])


def read_request_path(client):
    request = b""
    while b"\r\n\r\n" not in request and len(request) < 2048:
        part = client.recv(512)
        if not part:
            break
        request += part

    first_line = request.split(b"\r\n", 1)[0].decode("utf-8", "ignore")
    pieces = first_line.split()
    if len(pieces) < 2 or pieces[0] not in ("GET", "HEAD"):
        return None, False

    path = pieces[1].split("?", 1)[0]
    return path, pieces[0] == "HEAD"


def serve(client):
    path, is_head = read_request_path(client)
    if path is None:
        body = b"Bad request\n"
        send_response(client, "400 Bad Request", "text/plain; charset=utf-8", body)
        return

    if path == "/api/control":
        if potentiometer:
            # Median sampling rejects brief ADC spikes from the potentiometer
            # wiper while keeping the physical knob responsive.
            readings = [potentiometer.read_u16() for _ in range(5)]
            readings.sort()
            value = readings[2]
        else:
            value = None
        body = json.dumps({"pot": value}).encode("utf-8")
        send_response(client, "200 OK", "application/json; charset=utf-8", body)
        return

    file_info = FILES.get(path)
    if file_info is None:
        body = b"Not found\n"
        send_response(client, "404 Not Found", "text/plain; charset=utf-8", body)
        return

    filename, content_type = file_info
    try:
        with open(filename, "rb") as source:
            body = source.read()
    except OSError as error:
        print("Could not read", filename, error)
        body = b"File unavailable\n"
        send_response(client, "500 Internal Server Error", "text/plain; charset=utf-8", body)
        return

    header = (
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: " + content_type + "\r\n"
        "Content-Length: " + str(len(body)) + "\r\n"
        "Cache-Control: no-store\r\n"
        "Connection: close\r\n"
        "X-Content-Type-Options: nosniff\r\n"
        "\r\n"
    ).encode("utf-8")
    send_all(client, header)
    if not is_head:
        for start in range(0, len(body), 1024):
            send_all(client, body[start:start + 1024])
    print("Served", path, "as", filename)


def main():
    setup_physical_controls()
    connect_wifi()
    address = socket.getaddrinfo("0.0.0.0", 80)[0][-1]
    server = socket.socket()
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(address)
    # A page load opens several asset requests close together. The server
    # processes them one at a time, so keep a modest queue for the browser.
    server.listen(8)
    print("Desk Hub server ready")

    try:
        while True:
            client, remote = server.accept()
            try:
                serve(client)
            except Exception as error:
                print("Request error:", error)
            finally:
                client.close()
    finally:
        server.close()


main()
