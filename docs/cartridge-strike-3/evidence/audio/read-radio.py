"""Decode the shipped voice clips using a shared vocabulary and a general English model."""
import ctypes
import json
from pathlib import Path
import subprocess
import sys


def bind(library, name, arguments, result):
    function = getattr(library, name)
    function.argtypes = arguments
    function.restype = result
    return function


def main(root):
    decoder_lib = ctypes.CDLL("libpocketsphinx.so.3")
    base_lib = ctypes.CDLL("libsphinxbase.so.3")
    pointer, string, integer = ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int
    settings = bind(decoder_lib, "ps_args", [], pointer)
    parse = bind(base_lib, "cmd_ln_parse_r", [pointer, pointer, integer, ctypes.POINTER(string), integer], pointer)
    initialize = bind(decoder_lib, "ps_init", [pointer], pointer)
    add_grammar = bind(decoder_lib, "ps_set_jsgf_string", [pointer, string, string], integer)
    select_search = bind(decoder_lib, "ps_set_search", [pointer, string], integer)
    begin = bind(decoder_lib, "ps_start_utt", [pointer], integer)
    recognize = bind(decoder_lib, "ps_process_raw", [pointer, pointer, ctypes.c_size_t, integer, integer], integer)
    finish = bind(decoder_lib, "ps_end_utt", [pointer], integer)
    hypothesis = bind(decoder_lib, "ps_get_hyp", [pointer, ctypes.POINTER(ctypes.c_int32)], string)
    free_decoder = bind(decoder_lib, "ps_free", [pointer], integer)
    free_config = bind(base_lib, "cmd_ln_free_r", [pointer], integer)

    models = Path("/usr/share/pocketsphinx/model/en-us")
    args = ["radio-audit", "-hmm", str(models / "en-us"), "-dict", str(models / "cmudict-en-us.dict"),
            "-lm", str(models / "en-us.lm.bin"), "-samprate", "16000", "-logfn", "/dev/null"]
    argv = (string * len(args))(*[s.encode() for s in args])
    config = parse(None, settings(), len(args), argv, 1)
    if not config:
        raise RuntimeError("PocketSphinx could not load the English model configuration.")
    decoder = initialize(config)
    if not decoder:
        free_config(config)
        raise RuntimeError("PocketSphinx could not start the decoder.")

    # All clips, including the nonverbal control, receive the same alternatives.
    choices = (b"stick together [team] | stay together [team] | fall back | incoming | cover me | "
               b"go [go [go]] | need backup | need back up | get back | advance | contact | thank you | "
               b"help | push forward | move out | taking fire")
    clips = sorted((root / "assets/fps/audio").glob("action-*.ogg"))
    if len(clips) != 7:
        raise ValueError("The comparison requires all seven shipped action clips.")
    result = {}
    try:
        for mode in ["unconstrained", "commands"]:
            if mode == "commands":
                grammar = b"#JSGF V1.0; grammar radio; public <command> = " + choices + b" ;"
                if add_grammar(decoder, b"commands", grammar) or select_search(decoder, b"commands"):
                    raise RuntimeError("The shared command grammar could not be loaded.")
            for clip in clips:
                pcm = subprocess.check_output(["ffmpeg", "-nostdin", "-loglevel", "error", "-threads", "1",
                                               "-i", str(clip), "-ac", "1", "-ar", "16000", "-f", "s16le", "pipe:1"])
                data = ctypes.create_string_buffer(pcm)
                if begin(decoder) or recognize(decoder, data, len(pcm) // 2, 0, 1) < 0 or finish(decoder):
                    raise RuntimeError(f"Recognition failed for {clip.name}.")
                score = ctypes.c_int32()
                text = hypothesis(decoder, ctypes.byref(score))
                result.setdefault(clip.name, {})[mode] = text.decode() if text else None
    finally:
        free_decoder(decoder)
        free_config(config)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) == 2 else "."))
