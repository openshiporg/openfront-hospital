import { list } from '@keystone-6/core'
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { clinicalWorkflowDefinitions, controlledClinicalHooks } from '../lib/controlledClinicalHooks'
import { trackingFields } from './trackingFields'
export const Admission = list({
  db:{extendPrismaSchema(schema){return schema
    .replace(/facility\s+Facility\?/,'facility Facility').replace(/facilityId\s+String\?/,'facilityId String')
    .replace(/patient\s+Patient\?/,'patient Patient').replace(/patientId\s+String\?/,'patientId String')
    .replace(/attendingProvider\s+Provider\?/,'attendingProvider Provider').replace(/attendingProviderId\s+String\?/,'attendingProviderId String')
    .replace(/room\s+Room\?/,'room Room').replace(/roomId\s+String\?/,'roomId String')
    .replace(/bed\s+Bed\?/,'bed Bed').replace(/bedId\s+String\?/,'bedId String')}},
  access:{operation:{query:isSignedIn,create:denyAccess,update:denyAccess,delete:denyAccess},filter:{query:rules.canReadAdmissions}},graphql:{omit:{create:true,update:true,delete:true}},hooks:controlledClinicalHooks(clinicalWorkflowDefinitions.admission),
  ui:{hideCreate:true,hideDelete:true,listView:{initialColumns:['admissionNumber','status','patient','facility','bed']}},
  fields:{admissionNumber:text({isIndexed:'unique',validation:{isRequired:true}}),status:select({type:'string',options:[{label:'Admitted',value:'admitted'},{label:'Transferred',value:'transferred'},{label:'Discharged',value:'discharged'}],defaultValue:'admitted',validation:{isRequired:true}}),transitionVersion:integer({defaultValue:1,validation:{isRequired:true,min:1}}),operationKeyHash:text({isIndexed:'unique',access:{read:permissions.canAccessAllClinicalData},validation:{isRequired:true}}),requestHash:text({access:{read:permissions.canAccessAllClinicalData},validation:{isRequired:true}}),actorReference:text({access:{read:permissions.canReadAuditMetadata},validation:{isRequired:true}}),facility:relationship({ref:'Facility'}),patient:relationship({ref:'Patient'}),encounter:relationship({ref:'Encounter'}),attendingProvider:relationship({ref:'Provider'}),room:relationship({ref:'Room'}),bed:relationship({ref:'Bed'}),admittedAt:timestamp(),dischargedAt:timestamp(),dischargeDisposition:text({access:{read:permissions.canReadClinicalPhi}}),notes:text({access:{read:permissions.canReadClinicalPhi},ui:{displayMode:'textarea'}}),metadata:json({access:{read:permissions.canReadClinicalPhi}}),...trackingFields},
})
