Build the upload flow:
- A parent dashboard listing their children; "add child" form (name, grade).
- An upload page: pick a child, pick or type the sheet code, upload a photo of the finished worksheet (file picker plus mobile camera capture). Client-side checks: image type only, max 10MB, show a preview before submitting.
- On submit: save the photo to IndexedDB and create the submission record through the data layer with status "uploaded", then show the parent a confirmation.
Test it end to end and show me a real uploaded photo loading back from local storage.
