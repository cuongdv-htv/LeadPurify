# Feature: CSV Preview and Edit

## Goal
Allow users to view and edit basic data in a CSV file before uploading it to the processing queue.

## Tasks
- [x] **Task 1**: Install `papaparse` in the `frontend` directory.
- [x] **Task 2**: Create `CsvEditorModal` component in `frontend/src/components/CsvEditorModal.jsx`.
  - Display CSV data in a paginated table.
  - Implement basic styling.
- [x] **Task 3**: Add editing logic to `CsvEditorModal`.
  - Allow deleting rows.
  - Allow inline cell editing.
  - Add "Save & Upload" and "Cancel" buttons.
- [x] **Task 4**: Integrate into `frontend/src/App.jsx`.
  - Intercept the file upload event.
  - Parse the file using PapaParse.
  - Show the modal with parsed data.
  - Unparse modified data and upload via existing `/api/upload` endpoint.
