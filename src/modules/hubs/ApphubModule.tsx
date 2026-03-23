import { HubCardsModule } from './HubCardsModule'

export function ApphubModule() {
  return (
    <HubCardsModule
      title="AppHub — Catálogo de Apps"
      description="Configuração centralizada dos cards públicos do AppHub, com persistência em D1 no admin-app."
      endpoint="/api/apphub/config"
      adminActorFieldId="apphub-admin-actor"
      adminActorFieldName="apphubAdminActor"
    />
  )
}