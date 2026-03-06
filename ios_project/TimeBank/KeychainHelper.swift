// KeychainHelper.swift
// TimeBank
//
// Keychain 安全存储助手
// 替代 Android 的 SharedPreferences 存储敏感信息（密码等）
// 遵循 Apple 安全规范：使用 Keychain Services 而非 UserDefaults

import Foundation
import Security

struct KeychainHelper {

    private static let service = "com.jianglicheng.timebank"

    /// 保存字符串到 Keychain
    static func save(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }

        // 先删除旧值
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        // 写入新值
        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]

        let status = SecItemAdd(addQuery as CFDictionary, nil)
        if status != errSecSuccess {
            print("[TimeBank Keychain] Save error: \(status) for key: \(key)")
        }
    }

    /// 从 Keychain 读取字符串
    static func load(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        guard status == errSecSuccess,
              let data = item as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return nil
        }

        return value
    }

    /// 从 Keychain 删除值
    static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }

    /// 清除所有 TimeBank 相关的 Keychain 数据
    static func clearAll() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service
        ]
        SecItemDelete(query as CFDictionary)
    }
}
