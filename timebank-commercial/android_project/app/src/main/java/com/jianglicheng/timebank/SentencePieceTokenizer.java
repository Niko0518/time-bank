package com.jianglicheng.timebank;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class SentencePieceTokenizer {
    private static final String TAG = "SentencePieceTokenizer";

    public static final int PAD_ID = 0;
    public static final int EOS_ID = 1;
    public static final int BOS_ID = 2;
    public static final int UNK_ID = 3;

    private Map<String, Integer> tokenToId;
    private List<String> idToToken;
    private List<Float> scores;
    private boolean loaded = false;

    public SentencePieceTokenizer() {
        tokenToId = new HashMap<>();
        idToToken = new ArrayList<>();
        scores = new ArrayList<>();
    }

    public boolean loadFromJson(File jsonFile) {
        try {
            StringBuilder sb = new StringBuilder();
            BufferedReader reader = new BufferedReader(
                new InputStreamReader(new FileInputStream(jsonFile), StandardCharsets.UTF_8));
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            reader.close();

            JSONObject root = new JSONObject(sb.toString());
            JSONArray pieces = root.getJSONArray("pieces");

            for (int i = 0; i < pieces.length(); i++) {
                JSONObject piece = pieces.getJSONObject(i);
                String token = piece.getString("piece");
                int id = piece.getInt("id");
                float score = (float) piece.optDouble("score", 0.0);

                while (idToToken.size() <= id) {
                    idToToken.add(null);
                    scores.add(0.0f);
                }
                idToToken.set(id, token);
                scores.set(id, score);
                tokenToId.put(token, id);
            }

            loaded = true;
            Log.d(TAG, "Tokenizer loaded: " + tokenToId.size() + " tokens");
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to load tokenizer from JSON: " + e.getMessage(), e);
            return false;
        }
    }

    public boolean loadFromVocabList(File vocabFile) {
        try {
            BufferedReader reader = new BufferedReader(
                new InputStreamReader(new FileInputStream(vocabFile), StandardCharsets.UTF_8));
            String line;
            int id = 0;
            while ((line = reader.readLine()) != null) {
                String token = line.trim();
                if (token.isEmpty()) continue;

                String[] parts = token.split("\t");
                String piece = parts[0];
                float score = parts.length > 1 ? Float.parseFloat(parts[1]) : 0.0f;

                idToToken.add(piece);
                scores.add(score);
                tokenToId.put(piece, id);
                id++;
            }
            reader.close();

            loaded = true;
            Log.d(TAG, "Tokenizer loaded from vocab list: " + tokenToId.size() + " tokens");
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to load tokenizer from vocab list: " + e.getMessage(), e);
            return false;
        }
    }

    public int[] encode(String text) {
        if (!loaded || text == null || text.isEmpty()) {
            return new int[]{BOS_ID};
        }

        List<Integer> tokens = new ArrayList<>();
        tokens.add(BOS_ID);

        String remaining = text;
        while (!remaining.isEmpty()) {
            int bestLen = 0;
            int bestId = UNK_ID;

            int maxLen = Math.min(remaining.length(), 32);
            for (int len = maxLen; len >= 1; len--) {
                String candidate = remaining.substring(0, len);
                Integer id = tokenToId.get(candidate);
                if (id != null) {
                    bestLen = len;
                    bestId = id;
                    break;
                }
            }

            if (bestLen > 0) {
                tokens.add(bestId);
                remaining = remaining.substring(bestLen);
            } else {
                char ch = remaining.charAt(0);
                String charStr = String.valueOf(ch);
                Integer id = tokenToId.get(charStr);
                if (id != null) {
                    tokens.add(id);
                } else {
                    tokens.add(UNK_ID);
                }
                remaining = remaining.substring(1);
            }
        }

        int[] result = new int[tokens.size()];
        for (int i = 0; i < tokens.size(); i++) {
            result[i] = tokens.get(i);
        }
        return result;
    }

    public int[] encodeWithMaxLength(String text, int maxTokens) {
        int[] tokens = encode(text);
        if (tokens.length > maxTokens) {
            int[] truncated = new int[maxTokens];
            System.arraycopy(tokens, 0, truncated, 0, maxTokens - 1);
            truncated[maxTokens - 1] = EOS_ID;
            return truncated;
        }
        return tokens;
    }

    public String decode(int[] tokenIds) {
        if (!loaded || tokenIds == null || tokenIds.length == 0) {
            return "";
        }

        StringBuilder sb = new StringBuilder();
        for (int id : tokenIds) {
            if (id == BOS_ID || id == PAD_ID) continue;
            if (id == EOS_ID) break;
            if (id >= 0 && id < idToToken.size()) {
                String token = idToToken.get(id);
                if (token != null) {
                    sb.append(token);
                }
            }
        }

        String result = sb.toString();
        result = result.replace("\u2581", " ");
        result = result.replace("▁", " ");
        return result;
    }

    public int getVocabSize() {
        return idToToken.size();
    }

    public String idToPiece(int id) {
        if (id >= 0 && id < idToToken.size()) {
            return idToToken.get(id);
        }
        return null;
    }

    public int pieceToId(String piece) {
        Integer id = tokenToId.get(piece);
        return id != null ? id : UNK_ID;
    }

    public void loadFromList(List<String> pieces) {
        tokenToId.clear();
        idToToken.clear();
        scores.clear();

        for (int i = 0; i < pieces.size(); i++) {
            String piece = pieces.get(i);
            idToToken.add(piece);
            scores.add(0.0f);
            tokenToId.put(piece, i);
        }

        loaded = true;
    }

    public boolean isLoaded() {
        return loaded;
    }
}
