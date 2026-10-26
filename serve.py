"""Start the self-contained game locally without installing dependencies."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser

directory = str(Path(__file__).resolve().parent)
handler = partial(SimpleHTTPRequestHandler, directory=directory)
server = None
for port in range(5173, 5190):
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), handler)
        break
    except OSError:
        continue
if server is None:
    raise SystemExit("没有可用端口，请关闭旧的游戏窗口后重试。")
url = f"http://127.0.0.1:{server.server_port}"
print(f"方寸对决已启动：{url}\n按 Ctrl+C 结束。", flush=True)
threading.Timer(0.5, lambda: webbrowser.open(url)).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
