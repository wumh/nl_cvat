/*
* Copyright (C) 2018 Intel Corporation
* SPDX-License-Identifier: MIT
*/

/* global
    require:false
*/


(() => {
    const PluginRegistry = require('./plugins');
    const serverProxy = require('./server-proxy');

    function isBoolean(value) {
        return typeof (value) === 'boolean';
    }

    function isInteger(value) {
        return typeof (value) === 'number' && Number.isInteger(value);
    }

    function isEnum(value) {
        // Called with specific Enum context
        for (const key in this) {
            if (Object.prototype.hasOwnProperty.call(this, key)) {
                if (this[key] === value) {
                    return true;
                }
            }
        }

        return false;
    }

    function isString(value) {
        return typeof (value) === 'string';
    }

    function checkFilter(filter, fields) {
        for (const prop in filter) {
            if (Object.prototype.hasOwnProperty.call(filter, prop)) {
                if (!(prop in fields)) {
                    throw new window.cvat.exceptions.ArgumentError(
                        `Unsupported filter property has been recieved: "${prop}"`,
                    );
                } else if (!fields[prop](filter[prop])) {
                    throw new window.cvat.exceptions.ArgumentError(
                        `Received filter property ${prop} was not satisfied for checker`,
                    );
                }
            }
        }
    }

    const hidden = require('./hidden');
    function checkContext(wrappedFunction) {
        return async function wrapper(...args) {
            try {
                if (this instanceof window.cvat.classes.Task) {
                    hidden.taskID = this.id;
                } else if (this instanceof window.cvat.classes.Job) {
                    hidden.jobID = this.id;
                    hidden.taskID = this.task.id;
                } else {
                    throw new window.cvat.exceptions.ScriptingError('Bad context for the function');
                }
                const result = await wrappedFunction.call(this, ...args);
                return result;
            } finally {
                delete hidden.taskID;
                delete hidden.jobID;
            }
        };
    }

    function implementAPI(cvat) {
        cvat.plugins.list.implementation = PluginRegistry.list;
        cvat.plugins.register.implementation = PluginRegistry.register;

        cvat.server.about.implementation = async () => {
            const result = await serverProxy.server.about();
            return result;
        };

        cvat.server.share.implementation = async (directory) => {
            const result = await serverProxy.server.share(directory);
            return result;
        };

        cvat.server.login.implementation = async (username, password) => {
            await serverProxy.server.login(username, password);
        };

        cvat.users.get.implementation = async (filter) => {
            checkFilter(filter, {
                self: isBoolean,
            });

            let users = null;
            if ('self' in filter && filter.self) {
                users = await serverProxy.users.getSelf();
                users = [users];
            } else {
                users = await serverProxy.users.getUsers();
            }

            users = users.map(user => new window.cvat.classes.User(user));
            return users;
        };

        cvat.jobs.get.implementation = async (filter) => {
            checkFilter(filter, {
                taskID: isInteger,
                jobID: isInteger,
            });

            if (('taskID' in filter) && ('jobID' in filter)) {
                throw new window.cvat.exceptions.ArgumentError(
                    'Only one of fields "taskID" and "jobID" allowed simultaneously',
                );
            }

            if (!Object.keys(filter).length) {
                throw new window.cvat.exceptions.ArgumentError(
                    'Job filter must not be empty',
                );
            }

            let task = null;
            if ('taskID' in filter) {
                task = await cvat.tasks.get.implementation({ id: filter.taskID });
            } else {
                const job = await serverProxy.jobs.getJob(filter.jobID);
                task = await cvat.tasks.get.implementation({ id: job.task_id });
            }

            task = new window.cvat.classes.Task(task[0]);
            return filter.jobID ? task.jobs.filter(job => job.id === filter.jobID) : task.jobs;
        };

        cvat.tasks.get.implementation = async (filter) => {
            checkFilter(filter, {
                name: isString,
                id: isInteger,
                owner: isString,
                assignee: isString,
                search: isString,
                status: isEnum.bind(window.cvat.enums.TaskStatus),
                mode: isEnum.bind(window.cvat.enums.TaskMode),
            });

            if ('search' in filter && Object.keys(filter).length > 1) {
                throw new window.cvat.exceptions.ArgumentError(
                    'Do not use the filter field "search" with others',
                );
            }

            if ('id' in filter && Object.keys(filter).length > 1) {
                throw new window.cvat.exceptions.ArgumentError(
                    'Do not use the filter field "id" with others',
                );
            }

            const searchParams = new URLSearchParams();
            for (const field of ['name', 'owner', 'assignee', 'search', 'status', 'mode', 'id']) {
                if (Object.prototype.hasOwnProperty.call(filter, field)) {
                    searchParams.set(field, filter[field]);
                }
            }

            let tasks = await serverProxy.tasks.getTasks(searchParams.toString());
            tasks = tasks.map(task => new window.cvat.classes.Task(task));

            return tasks;
        };

        cvat.Task.annotations.upload.implementation = checkContext(
            async (file) => {
                // TODO: Update annotations
            },
        );

        cvat.Task.annotations.save.implementation = checkContext(
            async () => {
                // TODO: Save annotation on a server
            },
        );

        cvat.Task.annotations.clear.implementation = checkContext(
            async () => {
                // TODO: Remove all annotations
            },
        );

        cvat.Task.annotations.dump.implementation = checkContext(
            async () => {
                const { host } = window.cvat.config;
                const { api } = window.cvat.config;

                return `${host}/api/${api}/tasks/${this.taskID}/annotations/dump`;
            },
        );

        cvat.Task.annotations.statistics.implementation = checkContext(
            async () => {
                return new Statistics();
            },
        );

        cvat.Task.annotations.put.implementation = checkContext(
            async (arrayOfObjects) => {
                // TODO: Make from objects
            },
        );

        cvat.Task.annotations.get.implementation = checkContext(
            async (frame, filter) => {
                return [new ObjectState()];
                // TODO: Return collection
            },
        );

        cvat.Task.annotations.search.implementation = checkContext(
            async (filter, frameFrom, frameTo) => {
                return 0;
            },
        );

        cvat.Task.annotations.select.implementation = checkContext(
            async (frame, x, y) => {
                return null;
            },
        );

        cvat.Task.frames.get.implementation = checkContext(
            async (frame) => {
                return new FrameData(this.taskID, frame);
            },
        );

        cvat.Task.logs.put.implementation = checkContext(
            async (logType, details) => {
                // TODO: Put log into collection
            },
        );

        cvat.Task.logs.save.implementation = checkContext(
            async () => {

            },
        );

        cvat.Task.actions.undo.implementation = checkContext(
            async (count) => {
                // TODO: Undo
            },
        );

        cvat.Task.actions.redo.implementation = checkContext(
            async (count) => {
                // TODO: Redo
            },
        );

        cvat.Task.actions.clear.implementation = checkContext(
            async () => {
                // TODO: clear
            },
        );

        cvat.Task.events.subscribe.implementation = checkContext(
            async (type, callback) => {
                // TODO: Subscribe
            }
        );

        cvat.Task.events.unsubscribe.implementation = checkContext(
            async (type, callback) => {
                // TODO: Save log collection
            },
        );


        cvat.Job.annotations.upload.implementation = checkContext(
            async (file) => {
                // TODO: Update annotations
            },
        );

        cvat.Job.annotations.save.implementation = checkContext(
            async () => {
                // TODO: Save annotation on a server
            },
        );

        cvat.Job.annotations.clear.implementation = checkContext(
            async () => {
                // TODO: Remove all annotations
            },
        );

        cvat.Job.annotations.dump.implementation = checkContext(
            async () => {
                const { host } = window.cvat.config;
                const { api } = window.cvat.config;

                return `${host}/api/${api}/tasks/${this.taskID}/annotations/dump`;
            },
        );

        cvat.Job.annotations.statistics.implementation = checkContext(
            async () => {
                return new Statistics();
            },
        );

        cvat.Job.annotations.put.implementation = checkContext(
            async (arrayOfObjects) => {
                // TODO: Make from objects
            },
        );

        cvat.Job.annotations.get.implementation = checkContext(
            async (frame, filter) => {
                return [new ObjectState()];
                // TODO: Return collection
            },
        );

        cvat.Job.annotations.search.implementation = checkContext(
            async (filter, frameFrom, frameTo) => {
                return 0;
            },
        );

        cvat.Job.annotations.select.implementation = checkContext(
            async (frame, x, y) => {
                return null;
            },
        );

        cvat.Job.frames.get.implementation = checkContext(
            async (frame) => {
                return new FrameData(this.taskID, frame);
            },
        );

        cvat.Job.logs.put.implementation = checkContext(
            async (logType, details) => {
                // TODO: Put log into collection
            },
        );

        cvat.Job.logs.save.implementation = checkContext(
            async () => {

            },
        );

        cvat.Job.actions.undo.implementation = checkContext(
            async (count) => {
                // TODO: Undo
            },
        );

        cvat.Job.actions.redo.implementation = checkContext(
            async (count) => {
                // TODO: Redo
            },
        );

        cvat.Job.actions.clear.implementation = checkContext(
            async () => {
                // TODO: clear
            },
        );

        cvat.Job.events.subscribe.implementation = checkContext(
            async (type, callback) => {
                // TODO: Subscribe
            }
        );

        cvat.Job.events.unsubscribe.implementation = checkContext(
            async (type, callback) => {
                // TODO: Save log collection
            },
        );

        return cvat;
    }

    module.exports = implementAPI;
})();