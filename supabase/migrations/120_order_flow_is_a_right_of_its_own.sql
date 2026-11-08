-- 120: Order Flow is een eigen recht.
--
-- Haar beslissing van 22-10-2026, op de vraag wie de orderflow mag zien en of
-- sales de bedragen mag zien: "allebei, en sales mag bedragen zien". Dus het
-- recht `orderflow.view` gaat naar manager EN sales.
--
-- In de code (src/lib/permissions.ts) staat dit recht al in de startlijst van
-- beide rollen. Maar die startlijst geldt alleen voor een rol die GEEN rij
-- heeft in role_permissions: zodra er een rij is, wint die rij volledig
-- (src/contexts/auth-context.tsx, loadPermissions). Een rol die al eens op het
-- Permissions-scherm is opgeslagen mist dit recht dus, en ziet het tabblad niet.
--
-- Daarom werkt deze migratie alleen BESTAANDE rijen bij. Er wordt geen rij
-- aangemaakt: een rol zonder rij draait al op de startlijst, en daar staat
-- orderflow.view al in. Een rij aanmaken zou alle andere rechten van die rol
-- vastzetten op de code-standaard, en dat is niet gevraagd.
--
-- Alleen manager en sales. Warehouse en marketing worden niet aangeraakt.
--
-- Het recht wordt nergens in de database gebruikt — geen policy, geen functie
-- leest orderflow.view. Het is puur de poort voor het Order Flow-tabblad en
-- het menu-item in de app. Deze migratie verandert dus niets aan wie welke
-- rijen uit de database mag lezen.
--
-- Twee keer draaien kan geen kwaad: de rechten worden ontdubbeld.

begin;

update public.role_permissions
   set permissions = array(
         select distinct unnest(permissions || array['orderflow.view'])
       ),
       updated_at = now()
 where role in ('manager', 'sales')
   and not ('orderflow.view' = any(permissions));

commit;

-- Controle: manager en sales staan op true, de rest is ongemoeid.
select role,
       'orderflow.view' = any(permissions) as mag_order_flow_zien,
       cardinality(permissions)            as aantal_rechten,
       updated_at
  from public.role_permissions
 order by role;
