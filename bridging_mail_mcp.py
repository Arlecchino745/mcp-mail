import sys
import os
import subprocess
import threading
import signal

CREATE_NO_WINDOW = 0x08000000
proc = None

def handle_termination(signum, frame):
    if proc and proc.poll() is None:
        try:
            proc.terminate()
        except:
            pass
    sys.exit(0)

def main():
    global proc
    signal.signal(signal.SIGINT, handle_termination)
    signal.signal(signal.SIGTERM, handle_termination)

    proc = subprocess.Popen(
        ["node", "C:/Users/Shuakami/mcp-mail/dist/index.js"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=os.environ,
        creationflags=CREATE_NO_WINDOW,
        text=True,
        bufsize=1
    )

    def read_stdout():
        try:
            for line in proc.stdout:
                if line == "":
                    break
                sys.stdout.write(line)
                sys.stdout.flush()
        except:
            pass

    def read_stderr():
        try:
            for line in proc.stderr:
                if line == "":
                    break
                sys.stderr.write(line)
                sys.stderr.flush()
        except:
            pass

    def forward_stdin():
        try:
            for line in sys.stdin:
                proc.stdin.write(line)
                proc.stdin.flush()
        except:
            pass

    t_out = threading.Thread(target=read_stdout, daemon=True)
    t_err = threading.Thread(target=read_stderr, daemon=True)
    t_in  = threading.Thread(target=forward_stdin, daemon=True)

    t_out.start()
    t_err.start()
    t_in.start()

    return_code = None
    try:
        return_code = proc.wait()
    except KeyboardInterrupt:
        handle_termination(None, None)

    sys.exit(return_code if return_code is not None else 0)

if __name__ == "__main__":
    main()
