private func requestReplies(
context: String,
message: String,
previousReplies: [String]
) async throws -> [String] {
guard let url = URL(string: "\(backendBaseURL)/reply") else {
throw NSError(
domain: "BadURL",
code: 0,
userInfo: [NSLocalizedDescriptionKey: "Backend URL is invalid."]
)
}

var request = URLRequest(url: url)
request.httpMethod = "POST"
request.timeoutInterval = 20
request.setValue("application/json", forHTTPHeaderField: "Content-Type")

let body: [String: Any] = [
"category": selectedCategory.rawValue.lowercased(),
"message": message,
"previousReplies": []
]

request.httpBody = try JSONSerialization.data(withJSONObject: body)

let (data, response) = try await URLSession.shared.data(for: request)

guard let httpResponse = response as? HTTPURLResponse else {
throw NSError(
domain: "NoResponse",
code: 0,
userInfo: [NSLocalizedDescriptionKey: "No server response."]
)
}

let rawString = String(data: data, encoding: .utf8) ?? ""
print("STATUS CODE:", httpResponse.statusCode)
print("RAW RESPONSE:", rawString)

struct ReplyResponse: Decodable {
let replies: [String]
}

if let decoded = try? JSONDecoder().decode(ReplyResponse.self, from: data) {
return decoded.replies
.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
.filter { !$0.isEmpty }
}

if let decodedArray = try? JSONDecoder().decode([String].self, from: data) {
return decodedArray
.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
.filter { !$0.isEmpty }
}

throw NSError(
domain: "DecodeError",
code: httpResponse.statusCode,
userInfo: [NSLocalizedDescriptionKey: "Could not decode server replies."]
)
}
