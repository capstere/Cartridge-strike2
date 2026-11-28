#!/usr/bin/env python3
"""Check the real invitation QR pixels without writing or printing private links."""
from hashlib import sha256
from io import BytesIO
import sys

from PIL import Image
import zxingcpp

encoded = sys.stdin.buffer.read(262145)
if len(encoded) > 262144:
    sys.exit("Unexpected test image size.")
with Image.open(BytesIO(encoded)) as image:
    if max(image.size) > 2048:
        sys.exit("Unexpected test image dimensions.")
    result = zxingcpp.read_barcode(image.convert("RGB"))
if not result or not result.valid:
    sys.exit("Could not decode the invitation QR image.")
print(sha256(result.text.encode("utf-8")).hexdigest())
