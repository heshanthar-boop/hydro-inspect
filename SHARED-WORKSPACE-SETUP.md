# Shared access setup

Backend activated on 11 October 2026 (Asia/Colombo). Anonymous Authentication is enabled; shared-workspace rules are deployed alongside the existing sites/users rules. Project billing is disabled.

Live checks passed using two temporary visitor sessions: shared reads allowed, visitor inspection writes denied, edits of another visitor’s reading denied, creator corrections allowed and server timestamps assigned. Temporary test records/accounts were removed.


Owner: heshantha.pcl@gmail.com (verified Google sign-in). Everyone can read shared inspections and analytics. Visitors receive anonymous Firebase identities and can submit meter readings with a chosen operator name. Visitors may correct their own records; only the owner may correct other records or change inspections.

Configuration reference (already applied):

1. In the Firebase project solarpv-field-tool, enable Authentication > Sign-in method > Anonymous. Keep Google enabled.
2. Open Firestore Database > Rules. Copy the existing deployed rules first. Add firestore-shared.rules.fragment inside the existing database documents match; keep the rules used by other applications in this project. Ensure no broad allow-write rule also matches the hydro_workspaces path (Firestore combines matching allow rules). Publish the merged rules.
3. Sign in to HydroInspect as the owner. Sync migrates records from that account’s legacy private collection and local inspection records into the shared collection. Data in another account’s private cloud collection requires exporting/importing with the owner; the app does not bypass that account’s permissions.
4. Verify a second browser can read shared inspections, write a visitor reading, and cannot update inspections or another visitor’s reading.

Browser IDs identify a browser profile, not physical hardware. Clearing site data creates a new visitor/device identity. Client reading timestamps are operator-entered; server sync timestamps are assigned by Firestore. Public shared documents should contain only information intended for app viewers.

The database rules are required for secure shared permissions; hiding edit controls alone is insufficient. GitHub deployment cannot enable Firebase providers or publish Firestore rules.
