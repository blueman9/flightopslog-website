# Lessons learned

## FL-63 — derive Storage path from downloadURL, never construct it

**The rule:** When acting on a feedback attachment in Firebase Storage, parse the path out of `attachment.downloadURL`. Do not construct the path from the Firestore doc id.

**Why this exists:** In `feedback-attachments/{feedbackId}/{filename}`, the iOS app generates a fresh UUID for `{feedbackId}` per submission (`UUID().uuidString` in `FeedbackService.swift`) — it is not the same as the Firestore document id. Constructing the path from the doc id 404'd silently in the cleanup endpoint, and the 404-as-success branch wrongly reported "cleaned" while the actual files stayed in Storage.

**How to apply it:** The `Attachment` interface (`src/admin/types.ts`) doesn't carry a separate `path` field — `downloadURL` is the only ground truth for the storage location. Extract the part after `/o/` in the URL pathname and `decodeURIComponent` it. Treat unparseable downloadURLs as hard failures so wrong paths surface loud, not silent.
