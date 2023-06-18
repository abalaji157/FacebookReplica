const { DynamoDB } = require('aws-sdk');
var AWS = require('aws-sdk');
//const { ConfigurationServicePlaceholders } = require('aws-sdk/lib/config_service_placeholders');
AWS.config.update({ region: 'us-east-1' });
var db = new AWS.DynamoDB();
const s3 = new AWS.S3();
const fs = require('fs');
var SHA3 = require('crypto-js/sha3');
var uuid = require('uuid');
var stemmer = require("stemmer");
const { getSystemErrorMap } = require('util');

var uploadFile = function (username, file, pfp, callback) {
  // Read content from the file
  const fileContent = fs.readFileSync(fileName);
  var fName;
  if (pfp) {
    fName = username + '_pfp.jpg';
  } else {
    fName = username + '_background.jpg';
  }

  // Setting up S3 upload parameters
  const params = {
    Bucket: "g25.profile.images",
    Key: fName,
    Body: fileContent
  };

  // Uploading files to the bucket
  s3.upload(params, function (err, data) {
    if (err) {
      callback(err, null);
    } else {
      callback(err, data.Location);
    }
  });
};






//LOOKUP USERS
// look up login information
var lookupLogin = function (username, callback) {
  console.log('Looking up: ' + username);

  var params = {
    KeyConditions: {
      id: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S: username }]
      },
      user_relation: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S: "user" }]
      }
    },
    TableName: "users", // change table name and possibly attributes
    AttributesToGet: ['password']
  };

  db.query(params, function (err, data) {
    if (err || data.Items.length == 0) {
      callback(err, null);
    } else {
      callback(err, data.Items[0].password.S);
    }
  });

}

var lookupUserValue = function (username, param, callback) {
  console.log('Looking up: ' + username);
  //params to look up
  var params = {
    KeyConditions: {
      id: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S: username }]
      },
      user_relation: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S: "user" }]
      }
    },
    TableName: "users", // change table name and possibly attributes
    AttributesToGet: [param]
  }
  //querry
  db.query(params, function (err, data) {
    if (err || data.Items.length == 0) {
      callback(err, null);
    } else {
      callback(err, data.Items[0][param].S);
    }
  });
}

var lookupUser = function (username, callback) {
  console.log('Looking up: ' + username);
  //params to look up
  var params = {
    KeyConditions: {
      id: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S: username }]
      },
      user_relation: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S: "user" }]
      }
    },
    TableName: "users"
  }
  //querry
  db.query(params, function (err, data) {
    if (err || data.Items.length == 0) {
      callback(err, null);
    } else {
      callback(err, data.Items[0]);
    }
  });
}

var getUsers = function (callback) {
  //params to look up
  var params = {
    FilterExpression: "user_relation = :u",
    ExpressionAttributeValues: { ":u": { S: "user" } },
    ProjectionExpression: "id",
    TableName: "users"
  }
  //query
  db.scan(params, function (err, data) {
    if (err || data.Items.length == 0) {
      callback(err, null);
    } else {
      var arr = []
      for (let i = 0; i < data.Items.length; i++) {
        arr.push(data.Items[i].id.S)
      }
      callback(err, arr);
    }
  });
}







//FRIENDS
//request Friend
var addRequest = function (username, friendName, timestamp, callback) {
  var id1 = "REQUEST#" + friendName
  db.putItem(
    {
      "TableName": "users",
      "Item": {
        "id": { "S": username },
        "user_relation": { "S": id1 },
        'friend': { "S": friendName },
        'timestamp': { "S": timestamp.toString() },
      }
    }, function (err1, data) {
      if (err1) {
        console.log("error");
        console.log(err1);
        callback(err1, null);
      } else {
        callback(err1, data)
      }
    }
  )
}
var getRequests = function (username, callback) {
  console.log('Looking up requests of ' + username);
  //params to look up
  var params = {
    KeyConditions: {
      id: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S: username }]
      },
      user_relation: {
        ComparisonOperator: 'BEGINS_WITH',
        AttributeValueList: [{ S: "REQUEST#" }]
      }
    },
    TableName: "users", // change table name and possibly attributes
    AttributesToGet: ['timestamp', 'friend']
  }
  //querry
  db.query(params, function (err, data) {
    if (err) {
      callback(err, null);
    } else {
      data.Items.sort(function (a, b) {
        if (a.timestamp.N > b.timestamp.N) {
          return -1;
        }
        else {
          return 1;
        }
      });
      callback(err, data.Items);
    }
  });
}


// add new friend
var addFriend = function (username, friendName, timestamp, callback) {
  console.log('Adding friend: ' + friendName + ' for ' + username);
  var id1 = "FRIEND#" + friendName
  var id2 = "FRIEND#" + username
  // add to database
  db.putItem(
    {
      "TableName": "users",
      "Item": {
        "id": { "S": username },
        "user_relation": { "S": id1 },
        'friend': { "S": friendName },
        'timestamp': { "S": timestamp.toString() },
      }
    }, function (err1, data) {
      if (err1) {
        console.log("error");
        console.log(err1);
        callback(err1, null);
      } else {
        db.putItem( // throw error if attribute exists
          {
            "TableName": "users",
            "Item": {
              "id": { "S": friendName },
              "user_relation": { "S": id2 },
              'friend': { "S": username },
              'timestamp': { "S": timestamp.toString() },
            }
          }, function (err, data) {
            if (err) {
              console.log("error");
              console.log(err);
              callback(err, null);
            } else {
              callback(err, data);
            }
          }
        )
      }
    }
  )
}
var deleteFriend = function (username, friendName, callback) {
  console.log('Deleting friend: ' + friendName + ' for ' + username);
  var id1 = "FRIEND#" + friendName
  var id2 = "FRIEND#" + username
  // add to database
  db.deleteItem( // throw error if attribute exists
    {
      "TableName": "users",
      "Item": {
        "id": { "S": username },
        "user_relation": { "S": id1 },
      }
    }, function (err1, data) {
      if (err1) {
        console.log("error");
        console.log(err1);
        callback(err1, null);
      } else {
        db.deleteItem( // throw error if attribute exists
          {
            "TableName": "users",
            "Item": {
              "id": { "S": friendName },
              "user_relation": { "S": id2 },
            }
          }, function (err, data) {
            if (err) {
              console.log("error");
              console.log(err);
              callback(err, null);
            } else {
              callback(err, data);
            }
          }
        )
      }
    }
  )
}

var getFriends = function (username, callback) {
  console.log('Looking up friends of ' + username);
  //params to look up
  var params = {
    KeyConditions: {
      id: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S: username }]
      },
      user_relation: {
        ComparisonOperator: 'BEGINS_WITH',
        AttributeValueList: [{ S: "FRIEND#" }]
      }
    },
    TableName: "users", // change table name and possibly attributes
    AttributesToGet: ['timestamp', 'friend']
  }
  //querry
  db.query(params, function (err, data) {
    if (err) {
      callback(err, null);
    } else {
      data.Items.sort(function (a, b) {
        if (a.timestamp.N > b.timestamp.N) {
          return -1;
        }
        else {
          return 1;
        }
      });
      callback(err, data.Items);
    }
  });
}

var friendOnline = function (username, callback) {
  console.log('Looking up if ' + username + ' is online');
  //params to look up
  var params = {
    KeyConditions: {
      id: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S: username }]
      },
      user_relation: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S: "user" }]
      }
    },
    TableName: "users", // change table name and possibly attributes
    AttributesToGet: ['online']
  }
  //querry
  db.query(params, function (err, data) {
    if (err || data.Items.length == 0) {
      callback(err, null);
    } else {
      callback(err, data.Items[0].online.S);
    }
  });
}








//COMMENTS
// add comment
var addComment = function (postID, commentID, commentText, timestamp, username, callback) {
  console.log('Adding comment to ' + postID);
  var currId = 'COMMENT#' + commentID;
  console.log(commentText);
  // add to database
  db.putItem(
    {
      "TableName": "users",
      "Item": {
        "id": { "S": postID },
        "user_relation": { "S": currId },
        "timestamp": { "S": timestamp.toString() },
        'comment': { "S": commentText },
        'username': {"S": username},
        'likes': { "N": '0' },
      }
    }, function (err, data) {
      if (err) {
        console.log("error");
        console.log(err);
        callback(err, null);
      } else {
        callback(err, data);
      }
    }
  )
}
var deleteComment = function (postID, commentID, callback) {
  console.log('Deleting comment: ' + post);
  // add to database
  db.deleteItem( // throw error if attribute does not exist
    {
      "TableName": "users",
      "Item": {
        "id": { "S": postID },
        "user_relation": { "S": commentID },
      }
    }, function (err, data) {
      if (err) {
        console.log("error");
        console.log(err);
        callback(err, null);
      } else {
        callback(err, data);
      }
    }
  )
}


var getComments = function (postID, callback) {
  console.log('Looking up comments of ' + postID);
  //params to look up
  var params = {
    KeyConditions: {
      id: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S: postID }]
      },
      user_relation: {
        ComparisonOperator: 'BEGINS_WITH',
        AttributeValueList: [{ S: "COMMENT#" }]
      }
    },
    TableName: "users",
    AttributesToGet: ['comment', 'likes', 'username']
  }
  //query
  db.query(params, function (err, data) {
    if (err || data.Items.length == 0) {
      callback(err, null);
    } else {
      var returnVal = data.Items.map(({ comment, likes, username }) => [comment.S, likes.N, username.S]);
      callback(err, returnVal);
    }
  });
}
var updateComment = function (postID, commentID, text, callback) {
  var params = {
    "Key": {
      'id': { "S": postID },
      "user_relation": { "S": commentID }
    },
    'ReturnValues': 'UPDATED_NEW',
    "TableName": "users",
    ExpressionAttributeNames: {
      "#TE": 'comment',
    },
    ExpressionAttributeValues: {
      ":te": {
        S: text
      }
    },
    UpdateExpression: "SET #TE = :te",
  }
  db.updateItem(
    params,
    function (err, data) {
      if (err) {
        console.log("error");
        console.log(err);
        callback(err, null);
      } else {
        callback(err, data);
      }
    }
  )
}

var likeComment = function (postID, commentID, callback) {
  var params = {
    "Key": {
      'id': { "S": postID },
      "user_relation": { "S": commentID }
    },
    'ReturnValues': 'UPDATED_NEW',
    "TableName": "users",
    ExpressionAttributeNames: {
      "#L": 'likes',
    },
    ExpressionAttributeValues: {
      ":inc": {
        N: "1"
      },

    },
    UpdateExpression: "ADD #L :inc",
  }
  db.updateItem(
    params,
    function (err, data) {
      if (err) {
        console.log("error");
        console.log(err);
        callback(err, null);
      } else {
        callback(err, data);
      }
    }
  )
}








//POSTS
var getPosts = function (username, callback) {
  console.log('Current User: ' + username);
  var params = {
    KeyConditions: {
      id: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S: username }]
      },
      user_relation: {
        ComparisonOperator: 'BEGINS_WITH',
        AttributeValueList: [{ S: 'POST#' }]
      }
    },
    TableName: 'users'
  }
  db.query(params, function (err, data) {
    if (err) {
      callback(err, null);
    }
    else {
      data.Items.sort(function (a, b) {
        if (a.timestamp.N > b.timestamp.N) {
          return -1;
        }
        else {
          return 1;
        }
      });
      console.log(data.Items);
      callback(err, data.Items);
    }
  });
}

var addPost = function (username, timestamp, uuid, text, wall, hashtags, callback) {
  var currId = 'POST#' + uuid;
  console.log(currId);
  console.log(timestamp);
  console.log(username);
  console.log(text);
  console.log(wall);
  var params = {
    "TableName": "users",
    "Item": {
      "id": { "S": username },
      "user_relation": { "S": currId },
      "postID": { "S": uuid },
      "timestamp": { "S": timestamp.toString() },
      "likes": { "N": "0" },
      "text": { "S": text },
      "wall": { "S": wall },
      "hashtag": { "SS": hashtags },
    }
  }
  db.putItem(params, function (err, data) {
    if (err) {
      console.log(err, null);
    }
    else {
      callback(err, data);
    }
  });
}
var deletePost = function (username, uuid, callback) {
  var params = {
    "TableName": "users",
    "Item": {
      "id": { "S": username },
      "user_relation": { "S": uuid },
    }
  }
  db.deleteItem(params, function (err, data) {
    if (err) {
      console.log(err, null);
    }
    else {
      callback(err, data);
    }
  });
}
var updatePost = function (username, timestamp, uuid, text, callback) {
  console.log(timestamp);
  console.log(username);
  console.log(text);
  var params = {
    "Key": {
      'id': { "S": username },
      "user_relation": { "S": uuid }
    },
    'ReturnValues': 'UPDATED_NEW',
    "TableName": "users",
    ExpressionAttributeNames: {
      "#TI": 'timestamp',
      "#TE": 'text',
    },
    ExpressionAttributeValues: {
      ":ti": {
        S: timestamp.toString()
      },
      ":te": {
        S: text
      }
    },
    UpdateExpression: "SET #TI = :ti, #TE = :te",
  }
  db.updateItem(
    params,
    function (err, data) {
      if (err) {
        console.log("error");
        console.log(err);
        callback(err, null);
      } else {
        callback(err, data);
      }
    }
  )
}

var likePost = function (username, uuid, callback) {
  var params = {
    "Key": {
      'id': { "S": username },
      "user_relation": { "S": uuid }
    },
    'ReturnValues': 'UPDATED_NEW',
    "TableName": "users",
    ExpressionAttributeNames: {
      "#L": 'likes',
    },
    ExpressionAttributeValues: {
      ":inc": {
        N: "1"
      },

    },
    UpdateExpression: "ADD #L :inc",
  }
  db.updateItem(
    params,
    function (err, data) {
      if (err) {
        console.log("error");
        console.log(err);
        callback(err, null);
      } else {
        callback(err, data);
      }
    }
  )
}

var getTrendingPosts = function (callback) {
  var params = {
    FilterExpression: "begins_with(user_relation, :p)",
    ExpressionAttributeValues: { ":p": { S: "POST#" } },
    TableName: "users"
  }
  db.scan(params, function (err, data) {
    if (err) {
      callback(err, null);
    }
    else {
      data.Items.sort(function (a, b) {
        if (a.likes.N > b.likes.N) {
          return 1;
        }
        else {
          return -1;
        }
      });
      callback(err, data.Items);
    }
  });
}

var getHashtag = function (hastag, callback) {
  var params = {
    FilterExpression: "begins_with(user_relation, :p) AND contains(hashtag, :h)",
    ExpressionAttributeValues: {
      ":p": { S: "POST#" },
      ":h": { S: hashtag },
    },
    TableName: "users",
  }
  db.scan(params, function (err, data) {
    if (err) {
      callback(err, null);
    }
    else {
      data.Items.sort(function (a, b) {
        if (a.timestamp.N > b.timestamp.N) {
          return -1;
        }
        else {
          return 1;
        }
      });
      callback(err, data.Items);
    }
  });
}






//USERS
// add new account
var addUser = function (username, password, firstname, lastname, dob, email, aff, interest, callback) {
  console.log('Adding: ' + username);
  password = SHA3(password).toString();

  // add to database
  db.putItem( // throw error if attribute exists
    {
      "ConditionExpression": "attribute_not_exists(username)",
      "TableName": "users",
      "Item": {
        "id": { "S": username },
        "user_relation": { "S": "user" },
        "password": { "S": password },
        "firstname": { "S": firstname },
        "lastname": { "S": lastname },
        "email": { "S": email },
        "dob": { "S": dob },
        "affiliation": { "S": aff },
        "interests": { "SS": interest },
        "online": { "S": 't' },
      }
    }, function (err, data) {
      if (err) {
        console.log("error");
        console.log(err);
        callback(err, null);
      } else {
        callback(err, data);
      }
    }
  )
}

var userOnOffline = function (username, online, timestamp, callback) {
  params = {}
  if (!online) {
    console.log('Offline: ' + username);
    params = {
      "Key": {
        'id': { "S": username },
        "user_relation": { "S": "user" }
      },
      'ReturnValues': 'UPDATED_NEW',
      "TableName": "users",
      ExpressionAttributeNames: {
        "#O": 'online',
      },
      ExpressionAttributeValues: {
        ":o": {
          S: timestamp.toString()
        },
      },
      UpdateExpression: "SET #O = :o"
    }
  } else {
    console.log('Online: ' + username)
    params = {
      "Key": {
        'id': { "S": username },
        "user_relation": { "S": "user" }
      },
      'ReturnValues': 'UPDATED_NEW',
      "TableName": "users",
      ExpressionAttributeNames: {
        "#O": 'online',
      },
      ExpressionAttributeValues: {
        ":o": {
          S: 't'
        },
      },
      UpdateExpression: "SET #O = :o"
    }
  }
  // update database
  db.updateItem(
    params,
    function (err, data) {
      if (err) {
        console.log("error");
        console.log(err);
        callback(err, null);
      } else {
        callback(err, data);
      }
    }
  )
}

var updateUser = function (username, password, email, aff, interests, callback) {
  console.log('Updating: ' + username);

  password = SHA3(password).toString();

  var params = {};
  if (password == '') {
    if (interests == null) {
      params = {
        "Key": {
          'id': { "S": username },
          "user_relation": { "S": "user" }
        },
        'ReturnValues': 'UPDATED_NEW',
        "TableName": "users",
        ExpressionAttributeNames: {
          "#AFF": 'affiliation',
          "#EMAIL": 'email',
        },
        ExpressionAttributeValues: {
          ":a": {
            S: aff
          },
          ":e": {
            S: email
          }
        },
        UpdateExpression: "SET #AFF = :a, #EMAIL = :e"
      }
    } else {
      params = {
        "Key": {
          'id': { "S": username },
          "user_relation": { "S": "user" }
        },
        'ReturnValues': 'UPDATED_NEW',
        "TableName": "users",
        ExpressionAttributeNames: {
          "#AFF": 'affiliation',
          "#EMAIL": 'email',
          "#I": 'interests',
        },
        ExpressionAttributeValues: {
          ":a": {
            S: aff
          },
          ":e": {
            S: email
          },
          ":i": {
            SS: interests
          },
        },
        UpdateExpression: "SET #AFF = :a, #EMAIL = :e, #I = :i"
      }
    }
  } else {
    if (interests != null) {
      params = {
        "Key": {
          'id': { "S": username },
          "user_relation": { "S": "user" }
        },
        'ReturnValues': 'UPDATED_NEW',
        "TableName": "users",
        ExpressionAttributeNames: {
          "#AFF": 'affiliation',
          "#EMAIL": 'email',
          "#I": 'interests',
          "#P": 'password'
        },
        ExpressionAttributeValues: {
          ":a": {
            S: aff
          },
          ":e": {
            S: email
          },
          ":i": {
            SS: interests
          },
          ":p": {
            S: password
          }
        },
        UpdateExpression: "SET #AFF = :a, #EMAIL = :e, #I = :i, #P = :p"
      }
    } else {
      params = {
        "Key": {
          'id': { "S": username },
          "user_relation": { "S": "user" }
        },
        'ReturnValues': 'UPDATED_NEW',
        "TableName": "users",
        ExpressionAttributeNames: {
          "#AFF": 'affiliation',
          "#EMAIL": 'email',
          "#P": 'password'
        },
        ExpressionAttributeValues: {
          ":a": {
            S: aff
          },
          ":e": {
            S: email
          },
          ":p": {
            S: password
          }
        },
        UpdateExpression: "SET #AFF = :a, #EMAIL = :e, #P = :p"
      }
    }
  }

  // add to database
  // CHANGE ATTRIBUTES AND TABLE NAME
  db.updateItem(
    params,
    function (err, data) {
      if (err) {
        console.log("error");
        console.log(err);
        callback(err, null);
      } else {
        callback(err, data);
      }
    }
  )

}







var getArticles = function (search, callback) {
  // console.log("IN GETARTICLES IN DB")
  var words = search.split(" ")
  // console.log("search: " + search)
  // console.log("arr: " + words)
  var results = []

  for (let i = 0; i < words.length; i++) {
    words[i] = stemmer(words[i]).toLowerCase();
  };
  // console.log(words);
  var word_params = [];
  for (let i = 0; i < words.length; i++) {
    var param = {
      TableName: 'inverted',
      KeyConditionExpression: 'keyword = :key',
      ExpressionAttributeValues: {
        ':key': { S: words[i] }
      }
    }
    word_params.push(param);
  };
  var word_promise = [];
  // array of promises
  for (let i = 0; i < word_params.length; i++) {
    word_promise.push(db.query(word_params[i]).promise());
  };

  Promise.all(word_promise).then(
    successfulDataArray => {
      // console.log(successfulDataArray);
      const id_params = new Set();
      // for every promise
      // console.log("length: " + successfulDataArray.length);
      for (let i = 0; i < successfulDataArray.length; i++) {
        // for every result in each promise
        for (let j = 0; j < successfulDataArray[i].Items.length; j++) {
          // if (i == 0 && j == 0) {
          //   console.log(successfulDataArray[i].Items[j])
          // }
          // get talk_id
          id_params.add(successfulDataArray[i].Items[j].id.N);
        };
      };
      const id_promise = new Set();
      id_params.forEach(function (ip) {
        // console.log("id param: " + ip)
        var params = {
          TableName: 'news',
          KeyConditionExpression: 'id = :id',
          ExpressionAttributeValues: {
            ':id': { N: ip }
          }
        };
        id_promise.add(db.query(params).promise());
      });
      Promise.all(id_promise).then(
        successfulDataArray => {
          var temp = []
          // every result in each promise
          if (successfulDataArray) {
            const set = new Set();
            for (let i = 0; i < successfulDataArray.length; i++) {
              set.add(successfulDataArray[i].Items);
            }
            const set2 = new Set();
            set.forEach(function (value) {
              for (let i = 0; i < value.length; i++) {
                set2.add(value[i]);
              }
            })
            set2.forEach(function (arr) {
              // console.log(arr.headline.S);
              temp.push({ headline: arr.headline.S, authors: arr.authors.S, link: arr.link.S });
            })
            for (let i = 0; i < Math.min(15, temp.length); i++) {
              results.push(temp[i]);
            }
            // console.log(results);
            callback(null, results)
          }
        },
        errorDataArray => {
          // error
          console.log('error: ' + errorDataArray)
        }
      )
    },
    errorDataArray => {
      // error
      console.log('error: ' + errorDataArray)
    }
  );
}

var getRecArticles = function (user, callback)  {
  // query user table for id = user, user_relation = article_rec
  // split on ,:
  var params = {
    KeyConditions: {
      id: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S: user }]
      },
      user_relation: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S: "article_recs" }]
      }
    },
    TableName: "users", // change table name and possibly attributes
    AttributesToGet: ['recs']
  }
  //query
  db.query(params, function (err, data) {
    if (err || data.Items.length == 0) {
      callback(err, null);
    } else {
      console.log(data.Items[0])
      callback(err, data.Items[0].recs.SS);
    }
  });

} 

var likeArticle = function (user, id, callback) {
  var a = 'articlelike'+id
  db.putItem( // throw error if attribute exists
    {
      "TableName": "users",
      "Item": {
        "id": { "S": user },
        "user_relation": { "S": a }
      }
    }, function (err, data) {
      if (err) {
        console.log(err);
      } else {
        console.log('success')
      }
    }
  )
}

var addInvite = function(username, friend, callback) {
  var inviteString = 'INVITE#' + username; 
  var params = {
    "TableName": "users",
    "Item": {
      "id": {"S": friend},
      "user_relation": {"S": inviteString}
    }
  }
  db.putItem(params, function(err, data) {
    if (err) {
      console.log('couldnt put item');
      callback(err, null);
    }
    else {
      console.log('ITEM ADDED');
      callback(err, data);
    }
  });
}

var getInvites = function(username, callback) {
  var params = {
    KeyConditions: {
      id: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S : username}]
      },
      user_relation: {
        ComparisonOperator: 'BEGINS_WITH',
        AttributeValueList: [{ S : 'INVITE#'}]
      }
    },
    TableName: 'users'
  };

  db.query(params, function(err, data) {
    if (err) {
      callback(err, null);
    }
    else {
      callback(err, data);
    }
  });

}

var getChats = function(username, callback) {

  var params = {
    KeyConditions: {
      id: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S : username}]
      }, 
      user_relation: {
        ComparisonOperator: 'EQ', 
        AttributeValueList: [{ S : 'user'}]
      }
    },
    AttributesToGet: ['chats'],
    TableName: 'users'
  };
  db.query(params, function(err, data) {
    if (err) {
      console.log('err: ' + err);
      callback(err, null);
    }
    else {
      console.log(data.Items.length);
      console.log(data.Items);
      if (data.Items.length > 0 && (data.Items[0].chats)) {
        console.log('ITEMS ARE HERE');

        console.log(data.Items[0]);
        callback(err, data.Items[0].chats.L);
      }
      else {
        console.log('No chats for user');
        callback(err, {});
      }
    }
  })
}

var loadMessages = function(id, callback) {
  var params = {
    KeyConditions: {
      id: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S : id}]
      }
    },
    TableName: 'chats'
  };

  db.query(params, function(err, data) {

    if (err) {
      console.log('errhere');
      console.log(err);
    }
    else {

    
      data.Items.sort(function(a, b) {
        if (a.timestamp.N > b.timestamp.N) {
          return -1;
        }
        else {
          return 1; 
        }
      });
      console.log('items');
      callback(err, data);
    }
  });
}

var getMembers = function(id, callback) {
  console.log('called members');
  var params = {
    KeyConditions: {
      id: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S : id}]
      }
    },
    TableName: 'chats'
  };

  db.query(params, function(err, data) {
    console.log('query');
    if (err) {
      console.log('memberserr: ' + err);
    }
    else {
      callback(err, data);
    }
  });
}

var addMessage = function(chatID, messages, callback) {
 
  var curMessages = [];
  const params = {
    TableName: 'chats',
    Key: {
      id: {
        S: chatID
      }
    },
    UpdateExpression: 'set messages = :m',
    ExpressionAttributeValues: {
      ':m': {
        L: messages.map((message) => ({
          S: message
        }))
      }
    },
    ReturnValues: 'ALL_NEW'
  };
  db.updateItem(params, function(err, data) {
    if (err) {
      console.log(err);
      callback(err, null);
    }
    else {
      console.log('newdata');
      console.log(data);
      callback(err, data);
    }
  });
}

var removeInvite = function(username, inviter, callback) {
  var inviteString = 'INVITE#' + inviter; 
  console.log('INVITE: ' + inviteString);
  const params = {
    Key: {
      id: {
        S: username
      },
      user_relation: {
        S: inviteString
      }
    },
    ReturnValues: 'ALL_OLD',
    TableName: 'users'
  };
  console.log(params.Key); 
  console.log(params.ReturnValues);

  db.deleteItem(params, function(err, data) {
    if (err) {
      console.log('Couldnt Delete');
      console.log(err);
      callback(err, null);
    }
    else {
 
      console.log(data);
      callback(err, data);
    }
  }); 
};

var chatToUser = function(id, members, username, callback) {
  var curChats = []
  getChats(username, function(err, data) {
    if (err) {
      console.log('ERRR');
      console.log(err);
    }
    else {

     if (data.length != undefined) {
      for (item of data) {
        curChats.push(item.S);
        console.log(item.S);
      }
    }
      curChats.push(id);
      

      var updateParams = {
        TableName: 'users',
        Key: {
          id: {
            S: username
          },
          user_relation: {
            S: 'user'
          }
        },
        UpdateExpression: 'set chats = :m',
        ExpressionAttributeValues: {
          ':m': {
            L: curChats.map((chat) => ({
              S: chat
            }))
          }
        },
        ReturnValues: 'ALL_NEW'
      };
      console.log('612');
      db.updateItem(updateParams, function(err, data) {
      
        if (err) {

          console.log('err');
          console.log(err);
        
        }
        else {
          console.log('UPDATECHAT ITEM');
          console.log(data);
          callback(err, data);
        }
      });


    }
  });
  
};

var addChat = function(id, members, username, callback) {
  console.log(members);
  console.log(typeof(members));
  console.log('ENTEREDADDCHAT');
  memsarray = members.map((member) => ({
    S: member})); 
  console.log(memsarray);
  console.log(typeof(memsarray));
  messages = [];
  var params = {
    "TableName": "chats",
    "Item": {
      "id": {"S": id},
      "members": {"L": memsarray},
      "messages": {"L": messages},
      "type": {"S": 'private'}
    }
  }

  db.putItem(params, function(err, data) {
    if (err) {
      console.log('DATA ITEM WASNT PLACED');

      console.log(err);
      callback(err, data);
    }
    else {
      callback(err, data);
    }
      
      
});
}

var findMatching = function(chats, members, callback) {
  var matching = [];
  console.log(chats);
  chats = [...new Set(chats)];
  console.log('UNIQUE'); 
  console.log(chats);
  const params = {
    RequestItems: {
      'chats': {
        Keys: chats.map(chat => ({'id': {S: chat}})),
        ProjectionExpression: 'members, id'
      }
    }
  };

  db.batchGetItem(params, function(err, data) {
    if (err) {
      console.log(err);
      callback(err, null);
    }
    else {
      console.log('DATA');
      console.log(data);
      
      for (item of data.Responses.chats) {
        curMembers = [];
        console.log('ITEMITEM');
        console.log(item);
        for (cur of item.members.L) {
          curMembers.push(cur.S);
        }

        if (JSON.stringify(curMembers.sort()) == JSON.stringify(members.sort())) {
  
          matching.push(item.id.S);
        }
      }
      // for (item of data.Items) {
      //   console.log(item);
      // }
      callback(err, matching);
    }
  }
  );
};

var getMembersList = function(ids, callback) {
  const params = {
    RequestItems: {
      'chats': {
        Keys: ids.map(chat => ({'id': {S: chat}})),
        ProjectionExpression: 'members, id'
      }
    }
  }
  db.batchGetItem(params, function(err, data) {
    if (err) {
      callback(err, null);
    }
    else {
      callback(err, data);
    }
  });
}

var removeChat = function(username, chatID, callback) {
  var params = {
    TableName: 'users', 
    KeyConditions: {
      id: {
        ComparisonOperator: 'EQ', 
        AttributeValueList: [{ S : username}]
      }, 
      user_relation: {
        ComparisonOperator: 'EQ', 
        AttributeValueList: [{ S : 'user'}]
      }
    }
  };

  db.query(params, function(err, data) {
    if (err) {
      console.log(err);
    }
    else {
     
      var curChats = data.Items[0].chats.L; 
      var newChats = []; 
      for (item of curChats) {
        if (item.S != chatID) {
          newChats.push(item.S);
        }
      }
  

      var updateParams = {
        TableName: 'users',
        Key: {
          id: {
            S: username
          },
          user_relation: {
            S: 'user'
          }
        },
        UpdateExpression: 'set chats = :m',
        ExpressionAttributeValues: {
          ':m': {
            L: newChats.map((chat) => ({
              S: chat
            }))
          }
        },
        ReturnValues: 'ALL_NEW'
      };
      db.updateItem(updateParams, function(err1, data1) {
        if (err1) {
          console.log(err1);
        }
        else {
          var chatParams = {
            TableName: 'chats', 
            KeyConditions: {
            id: {
                ComparisonOperator: 'EQ', 
                AttributeValueList: [{ S : chatID}]
            }, 
          }
          }; 

          db.query(chatParams, function(err2, data2) {
            if (err2) {
              console.log(err2);
            }
            else {
              console.log('DATATWOITEMS');
              console.log(data2);
              console.log(data2.Items[0]);
              var newMembers = []; 
              if (data2.Items[0]) {
              for (cur of data2.Items[0].members.L) {
                if (cur.S != username) {
                  newMembers.push(cur.S);
                }
              }
            }

              var finParams = {
                TableName: 'chats',
                Key: {
                   id: {
                   S: chatID
                          }
                    },
                  UpdateExpression: 'set members = :m',
                  ExpressionAttributeValues: {
                    ':m': {
                      L: newMembers.map((member) => ({
                        S: member
                      }))
                    }
                  },
                  ReturnValues: 'ALL_NEW'
              }

              db.updateItem(finParams, function(err3, data3) {
                if (err3) {
                  console.log(err3);
                }
                else {
                  callback(err3, data3);

                }

              })
            }
          }
          )
        }
      })

    }
  });

}

// addFriend("x", "y", 1234, function(err, data) {
//   console.log('success');
// });
// addFriend("x", "z", 2345, function(err, data) {
//   console.log('success');
// });
// addFriend("z", "y", 3456, function(err, data) {
//   console.log('success');
// });


var addGroupInvite = function(username, members, sender, chatID, callback) {
  var invite = 'GROUP#'+sender; 
  var params = {
    "TableName": "users",
    "Item": {
      "id": {"S": username},
      "user_relation": {"S": invite},
      "members": {"L": members.map((member) => ({
        S: member
      }))}, 
      "inviteID": {"S": chatID}
    }
  }; 
  db.putItem(params, function(err, data) {
    if (err) {
      console.log(err);
      callback(err, null);
    }
    else {
 
      callback(err, data);
    }
  });

}

var getGroupInvites = function(username, callback) {
  var params = {
    TableName: 'users', 
    KeyConditions: {
      id: {
        ComparisonOperator: 'EQ', 
        AttributeValueList: [{ S : username}]
      }, 
      user_relation: {
        ComparisonOperator: 'BEGINS_WITH', 
        AttributeValueList: [{ S : 'GROUP#'}]
      }
    }
  };

  db.query(params, function(err, data) {
    if (err) {

      callback(err, null);
    }
    else {
      console.log('Group Invite Data');
      console.log(data);
      callback(err, data);
    }
  })
}

var removeGroupInvite = function(username, inviter, callback) {
  var inviteString = 'GROUP#'+inviter; 
  const params = {
    Key: {
      id: {
        S: username
      },
      user_relation: {
        S: inviteString
      }
    },
    ReturnValues: 'ALL_OLD',
    TableName: 'users'
  };

  db.deleteItem(params, function(err, data) {
    if (err) {
      console.log(err);
      callback(err, null);
    }
    else {
      callback(err, data);
    }
  });

}

var addBatchChats = async function(id, members, username, callback) {
  var idar = [];
  console.log('ID');
  console.log(id);
  idar.push({"S" : id});
  console.log('UPDATEIDAR: ' + idar);
  console.log(members);
  var promises = [];
// Loop through the list of members
for (const member of members) {
  console.log('MEMBER');
  console.log(member);
  // Append the ID to the 'chats' list attribute
  var updateParams = {
      TableName: 'users',
      Key: {
        id: {
          S: member
        },
        user_relation: {
          S: 'user'
        }
      },
      UpdateExpression: 'set chats = list_append(chats, :id)',
      ExpressionAttributeValues: {
        ':id': {
          "L": [{"S": id}]
        }
      },
      ReturnValues: 'ALL_NEW'
    };
  var cur = db.updateItem(updateParams).promise();
  promises.push(cur);
}

Promise.all(promises).then(
  data => {
    console.log('REACHED DATA');
    console.log(data);
    
    for (item of data) {
      console.log(item.Attributes.id.S);
      console.log(item.Attribute.chats);
    }
    callback(null, data);
  },
  err => {
    console.log('errr here');
    console.log(err);
    callback(err, null)
  });


} 





/* We define an object with one field for each method. For instance, below we have
   a 'lookup' field, which is set to the myDB_lookup function. In routes.js, we can
   then invoke db.lookup(...), and that call will be routed to myDB_lookup(...). */

// TODO Don't forget to add any new functions to this class, so app.js can call them. (The name before the colon is the name you'd use for the function in app.js; the name after the colon is the name the method has here, in this file.)

var database = {
  lookupLogin: lookupLogin,
  lookupUserValue: lookupUserValue,
  lookupUser: lookupUser,

  addUser: addUser,
  updateUser: updateUser,
  userOnOffline: userOnOffline,
  getUsers: getUsers,

  addRequest: addRequest,
  getRequests: getRequests,
  addFriend: addFriend,
  deleteFriend: deleteFriend,
  getFriends: getFriends,
  friendOnline: friendOnline,

  addPost: addPost,
  deletePost: deletePost,
  getPosts: getPosts,
  updatePost: updatePost,
  likePost: likePost,
  getTrendingPosts, getTrendingPosts,
  getHashtag, getHashtag,

  addComment: addComment,
  deleteComment: deleteComment,
  getComments: getComments,
  updateComment: updateComment,
  likeComment: likeComment,

  getNews: getArticles,
  get_newsrec: getRecArticles,

  likeArticle: likeArticle,

  addInvite: addInvite, 
  getInvites: getInvites, 
  getChats: getChats, 
  loadMessages: loadMessages, 
  getMembers: getMembers, 
  addMessage: addMessage, 
  removeInvite: removeInvite, 
  chatToUser: chatToUser, 
  addChat: addChat, 
  findMatching: findMatching, 
  getMembersList: getMembersList, 
  removeChat: removeChat, 
  addGroupInvite: addGroupInvite, 
  getGroupInvites: getGroupInvites, 
  removeGroupInvite: removeGroupInvite, 
  addBatchChats: addBatchChats
};

module.exports = database;
