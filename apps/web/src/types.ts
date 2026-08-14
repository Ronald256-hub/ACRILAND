export type Me={id:string;fullName:string;email:string;mustChangePassword:boolean;roles:string[];permissions:string[];branch?:{name:string}|null;department?:{name:string}|null};
export type DashboardSummary={vehicles:number;drivers:number;activeDrivers:number;licencesExpiringWithin90Days:number;branches:number;activeUsers:number;vehicleStatus:Record<string,number>};
