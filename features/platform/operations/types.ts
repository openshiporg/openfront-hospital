export type OperationsOption = {
  value: string
  label: string
}

export type OperationsWorkspaceOptions = {
  notices: string[]
  facilitiesCount: number
  patients: OperationsOption[]
  checkedInAppointments: OperationsOption[]
  encounters: OperationsOption[]
  inProgressEncounters: OperationsOption[]
  orders: OperationsOption[]
  labOrders: OperationsOption[]
  medicationOrders: OperationsOption[]
  procedureOrders: OperationsOption[]
  correctableResults: OperationsOption[]
}

export const emptyOperationsWorkspaceOptions: OperationsWorkspaceOptions = {
  notices: [],
  facilitiesCount: 0,
  patients: [],
  checkedInAppointments: [],
  encounters: [],
  inProgressEncounters: [],
  orders: [],
  labOrders: [],
  medicationOrders: [],
  procedureOrders: [],
  correctableResults: [],
}
