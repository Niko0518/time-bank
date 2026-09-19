#!/usr/bin/env python3
"""
[v8.0.0] TimeBank Tokenizer Conversion Script

Converts Google SentencePiece tokenizer.model (protobuf format) to vocab.json
that can be loaded by TimeBankLLM's Java SentencePieceTokenizer.

Usage:
    python convert_tokenizer.py [tokenizer.model path] [output vocab.json path]

Requirements:
    pip install sentencepiece

Default paths:
    tokenizer.model -> ./tokenizer.model
    vocab.json -> ./vocab.json

To generate vocab.txt instead (tab-separated, simpler format):
    python convert_tokenizer.py tokenizer.model vocab.txt --format txt
"""

import sys
import json
import os


def convert_to_json(input_path, output_path):
    try:
        import sentencepiece as spm
    except ImportError:
        print("ERROR: sentencepiece not installed. Run: pip install sentencepiece")
        sys.exit(1)

    if not os.path.exists(input_path):
        print(f"ERROR: tokenizer.model not found at: {input_path}")
        print("Please download the tokenizer.model from Google's Gemma model page.")
        print("Kaggle: https://www.kaggle.com/models/google/gemma")
        sys.exit(1)

    print(f"Loading: {input_path}")
    sp = spm.SentencePieceProcessor()
    sp.load(input_path)

    vocab_size = sp.get_piece_size()
    print(f"Vocab size: {vocab_size}")

    pieces = []
    for i in range(vocab_size):
        piece = sp.id_to_piece(i)
        score = sp.get_score(i)
        pieces.append({
            "id": i,
            "piece": piece,
            "score": score
        })

    result = {"pieces": pieces, "vocab_size": vocab_size}

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False)

    file_size = os.path.getsize(output_path)
    print(f"Saved: {output_path} ({file_size / 1024:.1f} KB)")
    print(f"Vocab entries: {vocab_size}")

    # Verify
    test_text = "Hello, World! 你好世界"
    ids = sp.encode(test_text)
    decoded = sp.decode(ids)
    print(f"\nTest encode: '{test_text}' -> {ids}")
    print(f"Test decode: {ids} -> '{decoded}'")

    return True


def convert_to_txt(input_path, output_path):
    try:
        import sentencepiece as spm
    except ImportError:
        print("ERROR: sentencepiece not installed. Run: pip install sentencepiece")
        sys.exit(1)

    if not os.path.exists(input_path):
        print(f"ERROR: tokenizer.model not found at: {input_path}")
        sys.exit(1)

    print(f"Loading: {input_path}")
    sp = spm.SentencePieceProcessor()
    sp.load(input_path)

    vocab_size = sp.get_piece_size()
    print(f"Vocab size: {vocab_size}")

    with open(output_path, 'w', encoding='utf-8') as f:
        for i in range(vocab_size):
            piece = sp.id_to_piece(i)
            score = sp.get_score(i)
            f.write(f"{piece}\t{score}\n")

    file_size = os.path.getsize(output_path)
    print(f"Saved: {output_path} ({file_size / 1024:.1f} KB)")
    print(f"Vocab entries: {vocab_size}")
    return True


def main():
    args = sys.argv[1:]

    input_path = "tokenizer.model"
    output_path = "vocab.json"
    output_format = "json"

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == "--format":
            i += 1
            if i < len(args):
                output_format = args[i]
        elif arg.endswith(".model"):
            input_path = arg
        elif arg.endswith(".json") or arg.endswith(".txt"):
            output_path = arg
        i += 1

    print("=" * 60)
    print("TimeBank Tokenizer Conversion v8.0.0")
    print("=" * 60)
    print(f"Input:  {input_path}")
    print(f"Output: {output_path}")
    print(f"Format: {output_format}")
    print()

    if output_format == "txt":
        success = convert_to_txt(input_path, output_path)
    else:
        success = convert_to_json(input_path, output_path)

    if success:
        print("\nPlace the output file in the models directory on your Android device:")
        print("  /Android/data/com.jianglicheng.timebank/files/models/" + os.path.basename(output_path))
        print()

        # Determine target filename for Android
        target_name = "vocab.json" if output_format == "json" else "vocab.txt"
        print("ADB push command:")
        print(f"  adb push {output_path} /sdcard/Android/data/com.jianglicheng.timebank/files/models/{target_name}")


if __name__ == "__main__":
    main()
