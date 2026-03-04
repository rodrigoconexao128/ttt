# Test Plan: Verify Ticket Image Upload with Supabase Storage

## 1) Objective
Validate that image upload in the Tickets module works end-to-end with Supabase Storage, including:
- Successful attachment upload from ticket UI
- Correct image rendering inside ticket conversation/details
- Proper cleanup/suppression behavior after image deletion
- Error handling and edge cases

---

## 2) Scope
### In Scope
- Web flow at `https://agentezap.online/tickets`
- Authentication with provided test account
- Open existing ticket or create new ticket
- Upload image attachment
- Visual confirmation that image appears correctly
- Delete attachment and verify suppression/removal in UI
- Verify storage/network behavior via browser dev tools (optional but recommended)

### Out of Scope
- Non-image attachments (PDF, DOCX, etc.)
- Mobile app behavior (unless web responsive checks are explicitly needed)
- Deep backend code review

---

## 3) Test Environment
- **URL:** `https://agentezap.online/tickets`
- **Browser(s):** Chrome (primary), optionally Firefox/Edge for parity
- **Credentials:**
  - Email: `rodrigo4@gmail.com`
  - Password: `Ibira2019!`
- **Storage backend:** Supabase Storage (assumed configured in app)
- **Network:** Stable internet; optionally test throttled conditions

---

## 4) Test Data
Prepare local files before running tests:
1. `valid_small.jpg` (~100 KB)
2. `valid_medium.png` (~2 MB)
3. `valid_large.jpg` near max allowed size (if max known)
4. `invalid_file.txt` (for negative testing)
5. `corrupt_image.jpg` (optional negative case)

If size limits are unknown, identify limit by behavior/messages and document findings.

---

## 5) Preconditions
- Test account is active and can access Tickets page.
- User has permission to create/update/delete ticket attachments.
- Supabase Storage bucket and policies are active for read/write/delete as needed.
- Browser cache can be cleared between retests when needed.

---

## 6) Main End-to-End Test Scenario (Required)

## Step 1: Navigate and Login
1. Open browser and go to `https://agentezap.online/tickets`.
2. Login with:
   - Email: `rodrigo4@gmail.com`
   - Password: `Ibira2019!`
3. Confirm successful authentication (tickets list or dashboard visible).

**Expected Result:**
- Login succeeds without error.
- Tickets page loads fully; no blocking console/network errors.

---

## Step 2: Open Existing Ticket or Create New Ticket
1. Try opening an existing ticket suitable for upload test.
2. If unavailable, create a new ticket with identifiable title/text, e.g.:
   - Subject: `Test Image Upload - YYYY-MM-DD HH:mm`
3. Ensure ticket detail/chat area is accessible.

**Expected Result:**
- Ticket opens/creates successfully.
- Attachment control (paperclip/upload button/drag-drop area) is visible and enabled.

---

## Step 3: Attach an Image
1. Click attachment upload control.
2. Select `valid_small.jpg` from local machine.
3. Submit/send message if upload is tied to message send.
4. Wait for upload completion indicator (spinner/progress/checkmark).

**Expected Result:**
- Upload completes successfully.
- No error toast/banner appears.
- Request to storage endpoint returns success (2xx) if checked in Network tab.

---

## Step 4: Confirm Image Display
1. Verify image appears inside ticket thread/details.
2. Check:
   - Thumbnail/preview renders correctly (not broken image)
   - Click-to-open/expand works (if feature exists)
   - Correct file is displayed (name/contents match selected image)
3. Refresh the page and reopen same ticket.
4. Confirm image still displays after reload.

**Expected Result:**
- Image is visible and properly rendered.
- Persisted attachment remains available after refresh.
- No unauthorized or expired URL errors during normal session.

---

## Step 5: Delete Attachment and Verify Suppression
1. Locate delete/remove option for uploaded image.
2. Delete the uploaded image (confirm modal if prompted).
3. Verify immediate UI behavior:
   - Image disappears from ticket thread/details
   - Placeholder/message reflects deletion state (if designed)
4. Refresh page and reopen ticket.
5. Verify image remains removed/suppressed.
6. Attempt to access previously opened image URL (if captured from network/preview) to verify expected behavior.

**Expected Result:**
- Image is suppressed/removed from UI immediately and after refresh.
- Old media link is no longer accessible **or** returns expected controlled behavior per product rules.
- No ghost thumbnail, stale cache artifact, or inconsistent message state.

---

## 7) Additional Validation Scenarios (Recommended)

### A. File Type Validation
- Upload `invalid_file.txt` via image uploader.
- **Expected:** blocked with clear validation message.

### B. File Size Limit Validation
- Upload near-limit and over-limit files.
- **Expected:** near-limit passes; over-limit rejected with clear message.

### C. Multiple Uploads in Same Ticket
- Upload 2–3 valid images sequentially.
- **Expected:** all appear correctly; order and association are correct.

### D. Network Interruption / Retry
- Temporarily throttle/offline during upload.
- **Expected:** upload fails gracefully with retry option and no corrupted ticket state.

### E. Permission/Authorization Behavior
- Validate that only permitted users can delete attachments (if role model exists).
- **Expected:** unauthorized actions blocked with proper feedback.

### F. Cross-Browser Smoke Check
- Repeat main flow quickly in another browser.
- **Expected:** no browser-specific rendering or upload failures.

---

## 8) Observability / Evidence Collection
For each run, collect:
- Timestamp, environment, browser version
- Ticket ID/URL used for test
- Uploaded file names/sizes
- Screenshots:
  1. Before upload
  2. After successful upload (image visible)
  3. After deletion (image suppressed)
- Network evidence (optional):
  - Upload request URL/status
  - Delete request URL/status
  - Any failed requests and response payload
- Console errors/warnings related to upload/render/delete

---

## 9) Pass/Fail Criteria
### Pass
- Main required scenario succeeds fully:
  - Login works
  - Ticket open/create works
  - Image upload succeeds
  - Image renders correctly and persists after refresh
  - Delete suppresses image and remains removed after refresh
- No critical/high severity defects observed.

### Fail
- Any required step fails, including:
  - Upload failure for valid image
  - Broken preview/render
  - Deletion not reflected/persisted
  - Security issue (unauthorized access to deleted/private media)

---

## 10) Defect Logging Template
When issues are found, capture using this format:
- **Title:** Short defect summary
- **Severity/Priority:** Critical/High/Medium/Low
- **Environment:** Browser + version, date/time
- **Preconditions:** Ticket state, account role, file used
- **Steps to Reproduce:** Numbered, exact steps
- **Expected Result:** What should happen
- **Actual Result:** What happened
- **Evidence:** Screenshots, network logs, console logs
- **Notes:** Intermittent? reproducibility rate?

---

## 11) Known Risk Areas to Watch
- Signed URL expiration causing broken image after refresh
- Race condition between message send and file upload completion
- UI cache showing deleted image until hard refresh
- Storage policy mismatch (upload allowed but delete denied)
- Filename/path collisions in Supabase bucket

---

## 12) Execution Checklist (Quick)
- [ ] Login successful at `/tickets`
- [ ] Ticket opened or created
- [ ] Valid image uploaded successfully
- [ ] Image displays correctly
- [ ] Image persists after refresh
- [ ] Image deleted/suppressed successfully
- [ ] Deletion persists after refresh
- [ ] Issues documented with evidence

---

## 13) Output
At completion, produce a brief test execution summary:
- Overall status: Pass/Fail
- Executed scenarios
- Defects found (count + IDs)
- Blocking issues (if any)
- Recommendation for release readiness
