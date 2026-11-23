# AYIFIN — Ayiti Finans

Application de microfinance multi-utilisateur temps réel, hébergée sur GitHub Pages + Supabase.

## Installation

### 1. Créer le projet Supabase
1. https://supabase.com → **Sign up** → **New project**
2. Nom : `ayifin`, mot de passe DB fort
3. Attendez 2 min

### 2. Exécuter le SQL
- Supabase → **SQL Editor** → **New query**
- Copiez tout le bloc SQL du fichier `SQL.md`
- **Run**

### 3. Créer l'utilisateur admin
- Supabase → **Authentication** → **Users** → **Add user**
  - Email : `admin@ayifin.com`
  - Password : `Admin@2025!`
  - ✅ Auto Confirm User
- Copiez l'UUID de l'utilisateur créé
- SQL Editor :
  ```sql
  INSERT INTO users (id, entreprise_id, username, role)
  VALUES ('<UUID_USER>', '00000000-0000-0000-0000-000000000001',
          'WadorveChessmanSuperAdmin', 'SUPERADMIN');
