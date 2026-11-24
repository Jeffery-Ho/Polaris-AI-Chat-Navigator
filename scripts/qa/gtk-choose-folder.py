"""Confirm the selected directory in Edge's GTK picker under the CI X server."""
import sys
import time

import pyatspi

browser_pid = int(sys.argv[1])
deadline = time.monotonic() + 8
last_buttons = set()
while time.monotonic() < deadline:
    for app in pyatspi.Registry.getDesktop(0):
        if app.get_process_id() != browser_pid:
            continue
        for window in app:
            if window.getRole() not in (pyatspi.ROLE_DIALOG, pyatspi.ROLE_FILE_CHOOSER):
                continue
            pending = [window]
            while pending:
                node = pending.pop()
                if node.getRole() == pyatspi.ROLE_PUSH_BUTTON:
                    last_buttons.add(node.name)
                    if node.name.strip("_").lower() in {"select", "open", "select folder", "select directory", "choose"} and node.getState().contains(pyatspi.STATE_SENSITIVE):
                        action = node.queryAction()
                        for index in range(action.nActions):
                            if action.getName(index) in {"click", "press", "activate"} and action.doAction(index):
                                sys.exit(0)
                elif node.getRole() not in (pyatspi.ROLE_TABLE, pyatspi.ROLE_TREE, pyatspi.ROLE_TREE_TABLE):
                    pending.extend(child for child in node if child)
    time.sleep(0.2)

sys.exit("GTK 目录选择器未提供确认动作；按钮 " + ", ".join(sorted(last_buttons)))
