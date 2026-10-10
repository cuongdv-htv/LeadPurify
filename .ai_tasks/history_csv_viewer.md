# Feature: History CSV Viewer and Editor

## Goal
Allow users to preview and edit the output CSV files (Alive/Dead) in the history tab, similar to the pre-upload preview.

## Tasks
- [x] **Task 1**: Generalize `CsvEditorModal` to support different modes (Upload vs. Download).
  - Add `confirmText` and `confirmIcon` props.
- [x] **Task 2**: Add "Preview" buttons to the history job cards next to the download buttons.
- [x] **Task 3**: Implement the preview logic in `App.jsx`.
  - Fetch the file content from the download URL.
  - Convert to a `File` object and pass it to `CsvEditorModal`.
  - Implement a `handleHistoryConfirm` function to download the edited file directly from the browser.
