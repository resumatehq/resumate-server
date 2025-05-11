declare module 'accesscontrol' {
    export class AccessControl {
        constructor(grants?: any);
        grant(role: string): IQueryInfo;
        getGrants(): any;
        can(role: string): IQueryInfo;
    }

    interface IQueryInfo {
        create(resource: string): IResourcePermission;
        createAny(resource: string): IQueryInfo;
        createOwn(resource: string): IQueryInfo;
        read(resource: string): IResourcePermission;
        readAny(resource: string): IQueryInfo;
        readOwn(resource: string): IQueryInfo;
        update(resource: string): IResourcePermission;
        updateAny(resource: string): IQueryInfo;
        updateOwn(resource: string): IQueryInfo;
        delete(resource: string): IResourcePermission;
        deleteAny(resource: string): IQueryInfo;
        deleteOwn(resource: string): IQueryInfo;
        extend(role: string): IQueryInfo;
    }

    interface IResourcePermission {
        attributes: string[] | string;
        granted: boolean;
        when(callback: (params: any) => boolean): IResourcePermission;
    }
} 