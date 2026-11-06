# CEH Study Reference

A personal, browser-based study tracker for organizing revision across 11 modules and 54 topics.

The application tracks topic completion locally in the browser and supports progress export/import so a study record can be backed up or moved between browser profiles.

> This is an independent study companion. It is not an official EC-Council product, is not endorsed by EC-Council, and does not replace official course material or the current exam blueprint.

## Features

- 11 study modules containing 54 topic entries.
- Module and overall progress tracking.
- Search and module navigation.
- Expand/collapse controls.
- Local progress persistence using browser `localStorage`.
- Progress export and import.
- Responsive layout and reduced-motion handling.

## Run locally

The module list is loaded from `assets/data/Modules-Conf.json`, so serve the repository over HTTP rather than opening `index.html` with the `file://` protocol.

```bash
python3 -m http.server 8000
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

## Deploy with Firebase Hosting

The root-level `firebase.json` publishes the repository root.

```bash
firebase login
firebase deploy --only hosting --project YOUR_FIREBASE_PROJECT_ID
```

Replace `YOUR_FIREBASE_PROJECT_ID` with the ID of the Firebase project you intend to deploy to. The Firebase CLI must be installed and authenticated.

## Repository layout

```text
.
├── assets/
│   ├── data/Modules-Conf.json
│   ├── favicon/
│   └── fonts/
├── index.html
├── script.js
├── style.css
├── 404.html
├── firebase.json
├── .gitignore
├── CONTRIBUTING.md
└── README.md
```

## Progress data and privacy

Progress is stored in the current browser profile. It is not synchronized to a server or shared between devices by this application. Use the export function to create a backup; imported files should be treated as user-controlled data.

The application does not require an account or application backend. The locally bundled fonts and favicon are loaded from this repository.

## Accuracy and content scope

The tracker currently represents the 11 modules and 54 topic labels included in its data file. This does not establish complete coverage of the current CEH syllabus or guarantee alignment with a particular exam version.

Use the current official EC-Council syllabus and course materials as the authoritative reference. Do not treat this tracker as a substitute for licensed training materials.

## License and third-party material

No blanket open-source license is included. The repository combines original application code with course-related topic labels and bundled third-party assets. Their ownership and redistribution terms must be reviewed separately before the whole repository can be licensed for reuse.

EC-Council, CEH, and related marks belong to their respective owners. Their use here is descriptive only and does not imply affiliation or endorsement.
