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
    content, n_objify = pattern.subn(new_objify, content, count=1)
    if n_objify != 1:
        print(f"error: expected exactly 1 OBJIFY match, got {n_objify}", file=sys.stderr)
        return 1

    # We only ever build for one target (aarch64-android) and only need to
    # run 64-bit Alpine binaries, so the 32-bit legacy loader is unneeded -
    # and its object file can't be linked into a pure-64-bit proot binary
    # via ld.lld ("incompatible with aarch64linux"). Just removing the line
    # that turns HAS_LOADER_32BIT on wasn't enough (still got built/linked
    # on the next run - something else must also feed it), so instead we
    # strip every `ifdef HAS_LOADER_32BIT ... endif` block outright. That
    # can't be defeated by whatever ends up (re-)defining the variable.
    block_pattern = re.compile(r"ifdef HAS_LOADER_32BIT\n.*?\nendif\n", re.DOTALL)
    content, n_blocks = block_pattern.subn("", content)
    if n_blocks == 0:
        print("error: no 'ifdef HAS_LOADER_32BIT' blocks found", file=sys.stderr)
        return 1
    print(f"Removed {n_blocks} 'ifdef HAS_LOADER_32BIT' block(s)")

    # Belt and suspenders: also neutralize the line that sets it, in case
    # a future proot version reorders things.
    content = re.sub(
        r"^\$\(eval \$\(call define_from_arch\.h,,HAS_LOADER_32BIT\)\)\n",
        "",
        content,
        count=1,
        flags=re.MULTILINE,
    )

    with open(path, "w") as f:
        f.write(content)
    print(f"Patched OBJIFY macro and disabled HAS_LOADER_32BIT in {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
