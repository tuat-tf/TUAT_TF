"""Expose only the two isolated review containers to host loopback; no DB port."""
import ipaddress
import json
import select
import socket
import socketserver
import subprocess
import threading


def container_address(name):
    result = subprocess.run(["docker", "inspect", name], check=True, capture_output=True, text=True)
    container = json.loads(result.stdout)[0]
    if container["Config"]["Labels"].get("com.docker.compose.project") != "tuat-quality-review":
        raise RuntimeError("Unexpected review container")
    networks = container["NetworkSettings"]["Networks"]
    if set(networks) != {"tuat-quality-review_review"}:
        raise RuntimeError("Review container has unexpected networking")
    address = networks["tuat-quality-review_review"]["IPAddress"]
    if not ipaddress.ip_address(address).is_private:
        raise RuntimeError("Unexpected review container address")
    return address


class Bridge(socketserver.BaseRequestHandler):
    def handle(self):
        with socket.create_connection(self.server.target, timeout=10) as upstream:
            sockets = (self.request, upstream)
            while True:
                ready, _, _ = select.select(sockets, [], [], 90)
                if not ready:
                    return
                for source in ready:
                    data = source.recv(65536)
                    if not data:
                        return
                    (upstream if source is self.request else self.request).sendall(data)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


servers = []
for name, local_port, remote_port in [("tuat-review-auth", 18001, 9999), ("tuat-review-rest", 18002, 3000)]:
    server = Server(("127.0.0.1", local_port), Bridge)
    server.target = (container_address(name), remote_port)
    servers.append(server)
    threading.Thread(target=server.serve_forever, daemon=True).start()
print("Review Auth/REST loopback bridges ready; database remains unpublished.", flush=True)
threading.Event().wait()
