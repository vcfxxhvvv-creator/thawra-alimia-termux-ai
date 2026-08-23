#!/usr/bin/env python3
"""
Patches proot's GNUmakefile OBJIFY macro.

proot's OBJIFY macro shells out to `objdump -f` and greps for "file
format"/"architecture" lines to auto-detect the target for objcopy.
llvm-objdump's -f output doesn't match the text format that grep/awk
expects (written for GNU binutils), so the detected values come out
empty -> "architecture UNKNOWN! unknown".

We always know the exact target in this pipeline (this repo only
builds for Android/aarch64, optionally with a legacy 32-bit ARM
loader), so this replaces the fragile shell-based auto-detection with
a plain Make conditional on $@ - no dependence on objdump text output
at all.

Usage: python3 patch_proot_makefile.py <path-to-proot-src>/GNUmakefile
"""
import re
import sys

def main() -> int:
    if len(sys.argv) != 2:
        print("usage: patch_proot_makefile.py <path-to-GNUmakefile>", file=sys.stderr)
        return 2

    path = sys.argv[1]
    with open(path) as f:
        content = f.read()

    new_objify = (
        "OBJIFY = $(OBJCOPY) --input-target=binary "
        "--output-target=$(if $(findstring m32,$@),elf32-littlearm,elf64-littleaarch64) "
        "--binary-architecture $(if $(findstring m32,$@),arm,aarch64) $< $@\n"
    )

    pattern = re.compile(r"OBJIFY = .*?\$< \$@\n", re.DOTALL)
    new_content, n = pattern.subn(new_objify, content, count=1)
    if n != 1:
        print(f"error: expected exactly 1 OBJIFY match, got {n}", file=sys.stderr)
        return 1

    with open(path, "w") as f:
        f.write(new_content)
    print(f"Patched OBJIFY macro in {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
