import { HubCardsModule } from './HubCardsModule'

export function AdminhubModule() {
  return (
    <HubCardsModule
      title="AdminHub — Catálogo Administrativo"
      description="Configuração centralizada dos cards administrativos do AdminHub, com persistência em D1 no admin-app."
      endpoint="/api/adminhub/config"
      adminActorFieldId="adminhub-admin-actor"
      adminActorFieldName="adminhubAdminActor"
    />
  )
}