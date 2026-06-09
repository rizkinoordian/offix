**Product Requirement Document**

**Timestamp Photo Generator - Google Form Auto-Upload Automation**

*Version 1.4 \| Option A: Browser Automation using Playwright/Selenium*

| **Item**        | **Description**                                                                                 |
|-----------------|-------------------------------------------------------------------------------------------------|
| Document Status | Draft for implementation planning                                                               |
| Base PRD        | Timestamp Photo Generator v1.3 - Interactive Map Support                                        |
| New Feature     | Automatic Google Form upload after timestamp photo generation                                   |
| Selected Option | Option A - Browser automation using Playwright/Selenium                                         |
| Core Principle  | Timestamp photo generation remains local-first; Google Form upload is an optional online module |
| Primary User    | Employee who repeatedly submits public transport usage evidence through Google Form             |

# 1. Overview

This PRD updates the existing Timestamp Photo Generator application by adding an optional Google Form auto-upload module. The current application already creates a timestamped photo and saves it to a local folder. The new feature will use browser automation to open a predefined Google Form, fill configured fields, upload the generated timestamp photo, and optionally submit the form.

This feature is intentionally separated from the offline core because Google Form upload requires internet access, Google account authentication, and interaction with an external Google service.

# 2. Background

The user must regularly submit a Google Form for public transport usage reporting. Most fields are repetitive and can be configured before the automation runs. The only changing input is usually the timestamped photo, date, and possibly the travel direction or transport type.

Manual submission creates repetitive work and increases the risk of wrong field selection, missed attachment, or inconsistent data. Browser automation reduces this administrative burden while still allowing the user to review the form if needed.

# 3. Objective

The objective is to automate the Google Form submission workflow after a timestamped photo is generated locally. The application should allow the user to configure all required Google Form fields in advance and then run a browser automation flow that fills the form, uploads the photo, and submits it according to user settings.

# 4. Target User

The target user is an employee who needs to submit daily or routine evidence of public transport usage through a Google Form. The expected user is non-technical, uses the application on a local PC, and wants a repeatable process with minimal manual input.

# 5. User Problem

After creating the timestamped photo, the user still needs to open the Google Form, fill repeated identity fields, select transport-related options, attach the photo, and submit the report. This is inefficient for repeated daily reporting. The user needs a controlled automation flow where all fixed fields can be configured once and reused.

# 6. Scope

## 6.1 In Scope

- Add a Google Form Automation module to the existing local web app.

- Allow the user to configure Google Form URL and field values before running automation.

- Allow the user to map visible Google Form questions to automation selectors or labels.

- Use the latest generated timestamp photo as the default upload file.

- Support manual photo selection if the default photo is not correct.

- Launch a local browser automation process using Playwright or Selenium.

- Fill text fields, dropdown fields, radio fields, and file upload fields.

- Support two run modes: Review Before Submit and Auto Submit.

- Store configuration and automation logs locally without a database.

- Provide clear error handling when Google login, form layout, network, or upload fails.

## 6.2 Out of Scope

- No bypassing Google login, CAPTCHA, security challenge, or access permission.

- No storage of Google account password in the application.

- No guaranteed offline submission to Google Form.

- No database for MVP.

- No multi-user account system for MVP.

- No automatic handling of major Google Form layout changes without remapping.

- No cloud storage outside the configured Google Form submission.

- No background scheduled submission without the user opening the local app first.

# 7. Functional Requirements

| **ID** | **Requirement**               | **Description**                                                                                                                   |
|--------|-------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| FR-01  | Photo Upload                  | The system shall allow the user to upload a JPG, JPEG, or PNG photo from the local device.                                        |
| FR-02  | Timestamp Photo Generation    | The system shall generate a timestamped photo using configured time, identity, location, and overlay settings.                    |
| FR-03  | Local Save                    | The system shall save the generated timestamp photo to a configured local output folder.                                          |
| FR-04  | Automation Settings Page      | The system shall provide a settings page for Google Form URL, field values, run mode, and browser profile configuration.          |
| FR-05  | Google Form URL Configuration | The user can input and save the target Google Form URL locally.                                                                   |
| FR-06  | Field Value Configuration     | The user can configure all required form answers before running automation.                                                       |
| FR-07  | Field Mapping Configuration   | The system shall allow mapping between Google Form question labels and automation actions.                                        |
| FR-08  | Latest Photo Selection        | The system shall automatically select the latest generated timestamp photo as the default upload file.                            |
| FR-09  | Manual Photo Override         | The user can manually select another local photo before upload.                                                                   |
| FR-10  | Browser Automation Launch     | The system shall launch a browser automation session from the local PC.                                                           |
| FR-11  | Google Login Handling         | The system shall use an existing logged-in browser session or pause and ask the user to login manually.                           |
| FR-12  | Text Field Filling            | The automation shall fill text fields such as NRK ASN, Lainnya, and Tidak Naik Angkutan Umum.                                     |
| FR-13  | Radio Field Selection         | The automation shall select configured radio options such as Jenis Pegawai ASN and Posisi Naik Angkutan Umum Massal.              |
| FR-14  | Dropdown Selection            | The automation shall select configured dropdown values such as Nama Pegawai and Jabatan.                                          |
| FR-15  | Date Field Filling            | The automation shall fill Waktu Penggunaan Angkutan Umum using the configured date or generated photo date.                       |
| FR-16  | File Upload                   | The automation shall attach the timestamped photo to the Foto TIMESTAMP Dalam Angkutan Umum field.                                |
| FR-17  | Review Before Submit Mode     | The automation shall stop before clicking Submit so the user can review the filled form.                                          |
| FR-18  | Auto Submit Mode              | The automation may click Submit automatically only when explicitly enabled by the user.                                           |
| FR-19  | Execution Status              | The system shall display progress states: Ready, Running, Waiting for Login, Uploading Photo, Review Required, Submitted, Failed. |
| FR-20  | Local Log                     | The system shall save a local log for each automation attempt.                                                                    |
| FR-21  | Retry Support                 | The user can retry failed automation after correcting the issue.                                                                  |
| FR-22  | Configuration Reset           | The user can reset or delete stored automation configuration.                                                                     |

# 8. Google Form Field Configuration

The automation must support the fields visible in the attached Google Form screenshot. The exact selector strategy should be confirmed during implementation because Google Forms can change its internal HTML structure.

| **Form Field**                     | **Input Type** | **Expected Value**                                                                                                                                         | **Validation**                                |
|------------------------------------|----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------|
| Jenis Pegawai ASN                  | Radio          | PNS / PPPK / CPNS                                                                                                                                          | Required                                      |
| Nama Pegawai                       | Dropdown       | Configured by user                                                                                                                                         | Required                                      |
| Jabatan                            | Dropdown       | Configured by user                                                                                                                                         | Required                                      |
| NRK ASN                            | Text           | Configured by user                                                                                                                                         | Required                                      |
| Waktu Penggunaan Angkutan Umum     | Date           | Manual or auto from photo timestamp                                                                                                                        | Required                                      |
| Posisi Naik Angkutan Umum Massal   | Radio          | Berangkat / Pulang                                                                                                                                         | Required                                      |
| Penggunaan Jenis Angkutan Umum     | Radio          | MRT, LRT Jabodebek, Kereta Bandara, KRL Jabodetabek, Transjakarta, Angkot Jaklingko, Angkot Umum, Bus Umum, Bus/Angkutan Antar Jemput Karyawan, Kapal Laut | Optional or required based on form validation |
| Lainnya                            | Text           | Default: 0                                                                                                                                                 | Required                                      |
| Tidak Naik Angkutan Umum           | Text           | Default: 0                                                                                                                                                 | Required                                      |
| Foto TIMESTAMP Dalam Angkutan Umum | File Upload    | Generated timestamp photo                                                                                                                                  | Required                                      |

# 9. Non-Functional Requirements

| **Category**       | **Requirement**                                                                                                                             |
|--------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| Offline Capability | Core timestamp photo generation must remain offline. Google Form automation requires internet and must be clearly marked as online.         |
| Privacy            | Photos remain local until the user runs upload. The system must not upload to any server other than the configured Google Form.             |
| Security           | The application must not store Google account passwords. It may use a local browser profile to preserve login session if the user approves. |
| Usability          | Non-technical users should configure values once and run automation using a simple button.                                                  |
| Reliability        | Automation must fail safely and provide clear fallback instructions if the form changes or login is required.                               |
| Performance        | The automation should open the form and start filling within 10 seconds under normal network conditions.                                    |
| Compatibility      | MVP should support Chromium-based automation through Playwright. Selenium may be supported if required.                                     |
| Maintainability    | Google Form field mapping should be stored in a config file so changes can be adjusted without code changes where possible.                 |
| File Handling      | Temporary files must be cleaned after processing. Generated photos and logs remain local unless deleted by the user.                        |
| Auditability       | Each automation run should create a local log with timestamp, filename, status, and error message if any.                                   |

# 10. User Flow

## 10.1 First-Time Setup

1\. User opens the local web app.

2\. User opens Google Form Automation Settings.

3\. User enters the Google Form URL.

4\. User configures default field values: employee type, name, position, NRK, transport type, direction, and default notes.

5\. User selects automation mode: Review Before Submit or Auto Submit.

6\. User optionally configures browser profile path for persistent Google login.

7\. User saves the configuration locally.

## 10.2 Daily Automation Flow

1\. User generates a timestamped photo using the existing tool.

2\. System saves the timestamped photo locally.

3\. User clicks Upload to Google Form.

4\. System shows a confirmation summary of form values and selected photo.

5\. User confirms Run Automation.

6\. System launches browser automation and opens the configured Google Form.

7\. If Google login is required, automation pauses and asks the user to login manually.

8\. Automation fills all configured fields.

9\. Automation uploads the selected timestamped photo.

10\. If Review Before Submit is enabled, automation stops and asks user to review and submit manually.

11\. If Auto Submit is enabled, automation submits the form automatically.

12\. System saves local automation log.

# 11. Technical Approach - Option A Browser Automation

The recommended implementation is a local web application with a backend process that can launch Playwright-controlled Chromium. The browser automation module should be isolated from the core photo timestamp module.

| **Component**     | **Responsibility**                                                                                  |
|-------------------|-----------------------------------------------------------------------------------------------------|
| Frontend          | Settings UI, confirmation screen, status display, and run button.                                   |
| Backend           | Receives automation request, validates files/config, starts Playwright/Selenium script.             |
| Automation Engine | Controls browser, opens Google Form, fills fields, uploads file, and submits or pauses for review.  |
| Local Config      | Stores Google Form URL, field values, field mapping, browser profile setting, and run mode as JSON. |
| Local Logs        | Stores execution history as JSON or text log files.                                                 |
| Output Folder     | Stores generated timestamp photos.                                                                  |

# 12. Local Configuration Design

The MVP should avoid a database. Configuration can be stored in a local JSON file.

> {  
> "googleFormUrl": "https://forms.gle/example",  
> "runMode": "review_before_submit",  
> "browserEngine": "playwright_chromium",  
> "usePersistentBrowserProfile": true,  
> "formValues": {  
> "jenisPegawaiAsn": "PNS",  
> "namaPegawai": "Nama Pegawai",  
> "jabatan": "Jabatan",  
> "nrkAsn": "123456",  
> "waktuPenggunaan": "auto_from_photo_or_today",  
> "posisiNaik": "Berangkat",  
> "jenisAngkutan": "KRL Jabodetabek",  
> "lainnya": "0",  
> "tidakNaikAngkutanUmum": "0"  
> },  
> "fileUpload": {  
> "useLatestGeneratedPhoto": true,  
> "allowedExtensions": \["jpg", "jpeg", "png"\],  
> "maxSizeMb": 10  
> }  
> }

# 13. Processing Logic

1\. Load saved Google Form automation configuration.

2\. Validate that Google Form URL is available.

3\. Validate that required form values are available.

4\. Select latest generated timestamp photo or user-selected photo.

5\. Validate file existence, extension, and size.

6\. Check internet availability.

7\. Launch Playwright/Selenium browser session.

8\. Open the configured Google Form URL.

9\. Detect whether Google login is required. If required, pause and ask user to login.

10\. Fill configured radio, dropdown, text, and date fields.

11\. Upload timestamped photo through the file upload control.

12\. Validate that the file appears attached in the form UI.

13\. Stop for manual review or submit automatically depending on run mode.

14\. Capture final status and save local log.

# 14. Output

- Filled Google Form in browser.

- Uploaded timestamped photo attachment.

- Submission confirmation screen if auto-submit succeeds.

- Manual review screen if review mode is selected.

- Local automation log file.

Suggested log file name: google_form_automation_log_YYYYMM.json

# 15. Error Handling

| **Error**              | **Likely Cause**                                         | **System Response**                                                     |
|------------------------|----------------------------------------------------------|-------------------------------------------------------------------------|
| Missing Form URL       | User has not configured Google Form URL.                 | Show settings page prompt and block automation.                         |
| Missing Required Value | One or more required fields are empty.                   | Show checklist of missing fields.                                       |
| No Generated Photo     | No timestamp photo is available.                         | Ask user to generate or select a photo first.                           |
| File Too Large         | Photo exceeds Google Form upload limit.                  | Show size warning and ask user to compress or choose another file.      |
| Internet Unavailable   | Google Form cannot be opened.                            | Show online requirement message.                                        |
| Google Login Required  | User is not logged in to Google.                         | Pause browser and ask user to login manually.                           |
| Form Field Not Found   | Google Form layout or label changed.                     | Stop automation and ask user to update field mapping.                   |
| Upload Failed          | File upload control rejected the file or network failed. | Show error and offer retry or manual upload.                            |
| Submit Failed          | Google or network issue after form filling.              | Keep browser open and save failed log.                                  |
| Automation Blocked     | Google security check, CAPTCHA, or permission issue.     | Stop automation; do not bypass security; ask user to complete manually. |

# 16. Acceptance Criteria

| **ID** | **Criteria**                                                                                                                                      |
|--------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| AC-01  | Given the user opens automation settings, when the user saves Google Form URL and field values, then the system stores the configuration locally. |
| AC-02  | Given a timestamped photo has been generated, when the user opens upload automation, then the latest generated photo is selected by default.      |
| AC-03  | Given the configuration is valid, when the user runs automation, then the system opens the configured Google Form in a browser.                   |
| AC-04  | Given the user is not logged in to Google, when the form requires login, then the system pauses and asks the user to login manually.              |
| AC-05  | Given valid configured values, when automation runs, then the system fills radio, dropdown, text, and date fields correctly.                      |
| AC-06  | Given a valid timestamp photo exists, when automation reaches the file upload field, then the system uploads the photo.                           |
| AC-07  | Given Review Before Submit mode is enabled, when fields and upload are complete, then automation stops before final submit.                       |
| AC-08  | Given Auto Submit mode is enabled, when all fields and upload are successful, then automation clicks Submit.                                      |
| AC-09  | Given any automation failure occurs, when the system stops, then it shows a clear error and keeps the browser available for manual completion.    |
| AC-10  | Given automation finishes, when the result is known, then the system saves a local log with status and error details if any.                      |

# 17. Risks and Considerations

| **Risk**                            | **Explanation**                                                    | **Mitigation**                                                          |
|-------------------------------------|--------------------------------------------------------------------|-------------------------------------------------------------------------|
| Conflict with Local-First Principle | Google Form upload requires internet and external upload.          | Separate this as optional online integration, not part of offline core. |
| Google Form UI Changes              | Automation may fail if labels, options, or HTML structure changes. | Use configurable field mapping and clear error messages.                |
| Authentication Dependency           | File upload forms often require Google login.                      | Use user-controlled browser login session; never store password.        |
| Security Challenge/CAPTCHA          | Google may block automated access.                                 | Do not bypass; pause for manual completion.                             |
| Wrong Submission Risk               | Automation could submit incorrect field values.                    | Default to Review Before Submit for MVP; make Auto Submit explicit.     |
| Privacy Risk                        | Photos and identity data are uploaded to Google.                   | Show warning and require user confirmation before upload.               |
| Maintenance Risk                    | Automation scripts may need updates when form changes.             | Create a mapping/settings page and document selector strategy.          |

# 18. Feature Priority

| **Priority** | **Feature**                                 | **Notes**                                           |
|--------------|---------------------------------------------|-----------------------------------------------------|
| P1           | Existing timestamp photo generation         | Core feature; must remain stable and local.         |
| P1           | Save timestamped photo locally              | Required before upload automation.                  |
| P2           | Google Form settings page                   | Required for Option A.                              |
| P2           | Playwright browser automation - review mode | Recommended MVP automation mode.                    |
| P2           | File upload automation                      | Required because form includes photo upload.        |
| P3           | Auto-submit mode                            | Allowed but should be disabled by default.          |
| P3           | Advanced selector auto-detection            | Future improvement if form changes often.           |
| P3           | Scheduled unattended submission             | Not recommended for MVP due to login/security risk. |

# 19. Implementation Notes for Developer

- Prefer Playwright over Selenium for MVP because it has simpler browser context management and file upload handling.

- Run automation from the backend process, not directly from the browser frontend.

- Use a persistent browser profile only after user consent so Google login can be reused.

- Do not hardcode Google Form internal element IDs only; prefer question label based locating where possible.

- Keep the browser visible in MVP so the user can understand what the automation is doing.

- Make Review Before Submit the default mode to reduce wrong-submission risk.

- Store configuration in local JSON under an app config directory.

- Store logs separately from generated photos.

- Never store Google password, cookies export, or credentials in plain text.

# 20. MVP Definition

The MVP for Option A should be browser automation with visible browser and Review Before Submit mode. Auto Submit can exist behind an explicit setting, but should not be the default.

- Settings page for form URL and field values.

- Latest generated photo selected automatically.

- Playwright opens Google Form.

- Automation fills fields and uploads photo.

- Automation stops before final submit.

- Clear error messages and local logs.

# 21. Future Enhancements

- Multiple saved profiles for different forms or employees.

- Auto-detect fields from Google Form labels.

- Submission history viewer inside the app.

- Photo compression before upload.

- One-click retry using previous failed configuration.

- Optional scheduled reminder, not unattended submission.
