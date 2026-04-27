#!/usr/bin/env python3
"""
ZPL Print Server - TCP Bridge for Zebra Printers
Receives POST requests with ZPL data and forwards to printer via raw TCP (port 9100).

Usage:
    python3 print-server.py

The server listens on http://localhost:5555
Send POST to /print with JSON body: {"zpl": "...", "ip": "192.168.1.100", "port": 9100}
"""

import json
import socket
from http.server import HTTPServer, BaseHTTPRequestHandler


class PrintHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path != '/print':
            self.send_error(404)
            return

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)

        try:
            data = json.loads(body)
            zpl = data.get('zpl', '')
            ip = data.get('ip', '')
            port = int(data.get('port', 9100))

            if not zpl or not ip:
                self.send_response(400)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(b'Missing zpl or ip')
                return

            # Send ZPL to printer via raw TCP
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(10)
            sock.connect((ip, port))
            sock.sendall(zpl.encode('utf-8'))
            sock.close()

            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'OK')
            print(f'[OK] Sent {len(zpl)} bytes to {ip}:{port}')

        except socket.error as e:
            self.send_response(502)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            msg = f'Printer connection failed: {e}'
            self.wfile.write(msg.encode())
            print(f'[ERROR] {msg}')

        except Exception as e:
            self.send_response(500)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            msg = f'Server error: {e}'
            self.wfile.write(msg.encode())
            print(f'[ERROR] {msg}')

    def log_message(self, format, *args):
        print(f'[{self.log_date_time_string()}] {format % args}')


if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', 5555), PrintHandler)
    print('ZPL Print Server running on http://localhost:5555')
    print('Press Ctrl+C to stop')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down.')
        server.shutdown()
