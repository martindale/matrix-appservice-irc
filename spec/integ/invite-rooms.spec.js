"use strict";
var q = require("q");
var test = require("../util/test");

// set up integration testing mocks
var env = test.mkEnv();

// set up test config
var appConfig = env.appConfig;
var roomMapping = appConfig.roomMapping;

describe("Invite-only rooms", function() {
    var botUserId = "@" + appConfig.botLocalpart + ":" + appConfig.homeServerDomain;
    var testUser = {
        id: "@flibble:wibble",
        nick: "flibble"
    };
    var testIrcUser = {
        localpart: roomMapping.server + "_foobar",
        id: "@" + roomMapping.server + "_foobar:" + appConfig.homeServerDomain,
        nick: "foobar"
    };

    beforeEach(function(done) {
        test.beforeEach(this, env);

        env.ircMock._autoConnectNetworks(
            roomMapping.server, roomMapping.botNick, roomMapping.server
        );

        // do the init
        test.initEnv(env).done(function() {
            done();
        });
    });

    it("should be joined by the bot if the AS does know the room ID",
    function(done) {
        var sdk = env.clientMock._client();
        var joinedRoom = false;
        sdk.joinRoom.andCallFake(function(roomId) {
            expect(roomId).toEqual(roomMapping.roomId);
            joinedRoom = true;
            return q({});
        });

        env.mockAsapiController._trigger("type:m.room.member", {
            content: {
                membership: "invite",
            },
            state_key: botUserId,
            user_id: testUser.id,
            room_id: roomMapping.roomId,
            type: "m.room.member"
        }).then(function() {
            if (joinedRoom) {
                done();
            }
        });
    });

    it("should be joined by a virtual IRC user if the bot invited them, " +
        "regardless of the number of people in the room.",
    function(done) {
        // when it queries whois, say they exist
        env.ircMock._whenClient(roomMapping.server, roomMapping.botNick, "whois",
        function(client, nick, cb) {
            expect(nick).toEqual(testIrcUser.nick);
            // say they exist (presence of user key)
            cb({
                user: testIrcUser.nick,
                nick: testIrcUser.nick
            });
        });

        var sdk = env.clientMock._client();
        // if it tries to register, accept.
        sdk._onHttpRegister({
            expectLocalpart: testIrcUser.localpart,
            returnUserId: testIrcUser.id
        });

        var joinedRoom = false;
        sdk.joinRoom.andCallFake(function(roomId) {
            expect(roomId).toEqual(roomMapping.roomId);
            joinedRoom = true;
            return q({});
        });

        var leftRoom = false;
        sdk.leave.andCallFake(function(roomId) {
            expect(roomId).toEqual(roomMapping.roomId);
            leftRoom = true;
            return q({});
        });

        var askedForRoomState = false;
        sdk.roomState.andCallFake(function(roomId) {
            expect(roomId).toEqual(roomMapping.roomId);
            askedForRoomState = true;
            return q([
            {
                content: {membership: "join"},
                user_id: botUserId,
                state_key: botUserId,
                room_id: roomMapping.roomId,
                type: "m.room.member"
            },
            {
                content: {membership: "join"},
                user_id: testIrcUser.id,
                state_key: testIrcUser.id,
                room_id: roomMapping.roomId,
                type: "m.room.member"
            },
            // Group chat, so >2 users!
            {
                content: {membership: "join"},
                user_id: "@someone:else",
                state_key: "@someone:else",
                room_id: roomMapping.roomId,
                type: "m.room.member"
            }
            ]);
        });

        env.mockAsapiController._trigger("type:m.room.member", {
            content: {
                membership: "invite",
            },
            state_key: testIrcUser.id,
            user_id: botUserId,
            room_id: roomMapping.roomId,
            type: "m.room.member"
        }).then(function() {
            expect(joinedRoom).toBe(true);
            expect(leftRoom).toBe(false);
            // should go off the fact that the inviter was the bot
            expect(askedForRoomState).toBe(false);
            done();
        });
    });
});
