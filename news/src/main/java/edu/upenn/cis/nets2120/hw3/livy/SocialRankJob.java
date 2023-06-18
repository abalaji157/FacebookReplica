package edu.upenn.cis.nets2120.hw3.livy;

import org.apache.livy.Job;
import org.apache.livy.JobContext;
import org.apache.spark.api.java.JavaPairRDD;
import org.apache.spark.api.java.JavaRDD;
import org.apache.spark.api.java.JavaSparkContext;
import org.apache.spark.sql.SparkSession;

import edu.upenn.cis.nets2120.config.Config;
import edu.upenn.cis.nets2120.storage.SparkConnector;
import scala.Tuple2;
import software.amazon.awssdk.services.dynamodb.model.DynamoDbException;
import java.io.IOException;
import java.util.*;
import java.io.*;
import java.net.URL;

import com.amazonaws.services.dynamodbv2.document.BatchWriteItemOutcome;
import com.amazonaws.services.dynamodbv2.document.DynamoDB;
import com.amazonaws.services.dynamodbv2.document.Item;
import com.amazonaws.services.dynamodbv2.document.Table;
import com.amazonaws.services.dynamodbv2.document.TableWriteItems;
import com.amazonaws.services.dynamodbv2.document.UpdateItemOutcome;
import com.amazonaws.services.dynamodbv2.document.api.PutItemApi;
import com.amazonaws.services.dynamodbv2.model.AttributeDefinition;
import com.amazonaws.services.dynamodbv2.model.KeySchemaElement;
import com.amazonaws.services.dynamodbv2.model.KeyType;
import com.amazonaws.services.dynamodbv2.model.ProvisionedThroughput;
import com.amazonaws.services.dynamodbv2.model.ResourceInUseException;
import com.amazonaws.services.dynamodbv2.model.ScalarAttributeType;
import com.amazonaws.services.dynamodbv2.model.ScanRequest;
import com.amazonaws.services.dynamodbv2.model.ScanResult;
import com.amazonaws.services.dynamodbv2.model.AttributeValue;
import com.amazonaws.services.dynamodbv2.document.utils.ValueMap;
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClient;
import com.amazonaws.services.dynamodbv2.AmazonDynamoDB;
import com.amazonaws.auth.DefaultAWSCredentialsProviderChain;
import com.amazonaws.auth.SystemPropertiesCredentialsProvider;
import com.amazonaws.client.builder.AwsClientBuilder;
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClientBuilder;

import edu.upenn.cis.nets2120.config.Config;
import edu.upenn.cis.nets2120.hw3.Article;
import edu.upenn.cis.nets2120.storage.SparkConnector;
import edu.upenn.cis.nets2120.storage.DynamoConnector;
import scala.Tuple2;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder; 

public class SocialRankJob implements Job<String> {
	/**
	 * 
	 */
	private static final long serialVersionUID = 1L;

	/**
	 * Connection to Apache Spark
	 */
	SparkSession spark;
	
	JavaSparkContext context;

	DynamoDB db;

	Table recs;

	private String source;
	

	/**
	 * Initialize the database connection and open the file
	 * 
	 * @throws IOException
	 * @throws InterruptedException 
	 * @throws DynamoDbException 
	 */
	public void initialize() throws IOException, InterruptedException {
		System.out.println("Connecting to Spark...");
		spark = SparkConnector.getSparkConnection();
		context = SparkConnector.getSparkContext();
		db = DynamoConnector.getConnection(Config.DYNAMODB_URL);
		try {

			recs = db.createTable("recs", Arrays.asList(new KeySchemaElement("user", KeyType.HASH), // Partition
																												// key
					new KeySchemaElement("article_id", KeyType.RANGE)), // Sort key
					Arrays.asList(new AttributeDefinition("user", ScalarAttributeType.S),
							new AttributeDefinition("article_id", ScalarAttributeType.S)),
					new ProvisionedThroughput(100L, 100L));

			recs.waitForActive();
		} catch (final ResourceInUseException exists) {
			recs = db.getTable("recs");
			// recs.delete();
			// recs.waitForDelete();
			// try {
			// 	recs = db.createTable("recs", Arrays.asList(new KeySchemaElement("user", KeyType.HASH), // Partition
			// 																									// key
			// 		new KeySchemaElement("article_id", KeyType.RANGE)), // Sort key
			// 		Arrays.asList(new AttributeDefinition("user", ScalarAttributeType.S),
			// 				new AttributeDefinition("article_id", ScalarAttributeType.S)),
			// 		new ProvisionedThroughput(25L, 25L));

			// 	recs.waitForActive();
			// } catch (final ResourceInUseException e) {
			// 	recs = db.getTable("recs");
			// }
		}

		System.out.println("Connected!");
	}
	
	/**
	 * Fetch the articles from the S3 path, and create a (article, category) edge graph
	 * 
	 * @return JavaPairRDD: (article: String, category: String)
	 */
	JavaPairRDD<String, String> getArticleToCategory() {

		// TODO Load the file filePath into an RDD (take care to handle both spaces and tab characters as separators)
		// JavaRDD<String> file = context.textFile(filePath, Config.PARTITIONS);
		
		// json parser
		GsonBuilder builder = new GsonBuilder(); 
		builder.setPrettyPrinting(); 
		Gson gson = builder.create(); 
		Scanner reader = null;
		InputStream fil = null;

		// can't use gson inside of rdd, can make a list of articles externally and then turn into an rdd
		// List<Article> list = new ArrayList<>();
		List<String> headline = new ArrayList<>();
		List<String> category = new ArrayList<>();
		int i = 0;
		try {
			fil = new URL(this.source).openStream();
			reader = new Scanner(fil, "UTF-8");
			// File fil = new File(filepath);
			// Scanner reader = new Scanner(fil);
	
			String nextLine = null;

			while (reader.hasNextLine()) {
				nextLine = reader.nextLine();
				// System.out.println(nextLine);
				Article a = gson.fromJson(nextLine, Article.class);
				headline.add("" + i);
				category.add(a.getCategory().toLowerCase());
				i++;
			}
		} catch (Exception e) {
			e.printStackTrace();
		} finally {
			if (reader != null)
				reader.close();
		}

		// JavaRDD<Article> rdd = context.parallelize(list);
		// JavaPairRDD<String, String> graph = rdd.mapToPair(item -> new Tuple2<String, String>(item.getHeadline(), item.getCategory()));

		// JavaPairRDD<String, String> graph = file.map(string -> gson.fromJson(string, Article.class))
		// 	.mapToPair(article -> new Tuple2<String, String>(article.getHeadline(), article.getCategory()));

		JavaPairRDD<Long, String> hRDD = context.parallelize(headline).zipWithIndex().mapToPair(item -> new Tuple2<Long, String>(item._2, item._1));
		JavaPairRDD<Long, String> cRDD = context.parallelize(category).zipWithIndex().mapToPair(item -> new Tuple2<Long, String>(item._2, item._1));
		JavaPairRDD<String, String> graph = hRDD.join(cRDD).mapToPair(item -> new Tuple2<String, String>(item._2._1, item._2._2));
		
		return graph;
	}
	
	/**
	 * Fetch the articles from the S3 path, and create a (category, article) edge graph
	 * 
	 * @return JavaPairRDD: (category: String, article: String)
	 */
	JavaPairRDD<String, String> getCategoryToArticle() {

		// TODO Load the file filePath into an RDD (take care to handle both spaces and tab characters as separators)
		// JavaRDD<String> file = context.textFile(filePath, Config.PARTITIONS);
		
		// json parser
		GsonBuilder builder = new GsonBuilder(); 
		builder.setPrettyPrinting(); 
		Gson gson = builder.create(); 
		Scanner reader = null;
		InputStream fil = null;

		// can't use gson inside of rdd, can make a list of articles externally and then turn into an rdd
		// List<Article> list = new ArrayList<>();
		List<String> headline = new ArrayList<>();
		List<String> category = new ArrayList<>();
		int i = 0;
		try {
			fil = new URL(this.source).openStream();
			reader = new Scanner(fil, "UTF-8");
			// File fil = new File(filepath);
			// Scanner reader = new Scanner(fil);
	
			String nextLine = null;

			while (reader.hasNextLine()) {
				nextLine = reader.nextLine();
				// System.out.println(nextLine);
				Article a = gson.fromJson(nextLine, Article.class);
				headline.add("" + i);
				category.add(a.getCategory().toLowerCase());
				i++;
			}
		} catch (Exception e) {
			e.printStackTrace();
		} finally {
			if (reader != null)
				reader.close();
		}
		
		JavaPairRDD<Long, String> hRDD = context.parallelize(headline).zipWithIndex().mapToPair(item -> new Tuple2<Long, String>(item._2, item._1));
		JavaPairRDD<Long, String> cRDD = context.parallelize(category).zipWithIndex().mapToPair(item -> new Tuple2<Long, String>(item._2, item._1));
		JavaPairRDD<String, String> graph = cRDD.join(hRDD).mapToPair(item -> new Tuple2<String, String>(item._2._1, item._2._2));
		
		// rdd.mapToPair(item -> new Tuple2<String, String>(item.getHeadline(), item.getCategory()));

		// JavaPairRDD<String, String> graph = file.map(string -> gson.fromJson(string, Article.class))
		// 	.mapToPair(article -> new Tuple2<String, String>(article.getCategory(), article.getHeadline()));
		
		return graph;
	}

	/**
	 * Fetch the friends from user database, and create a (user1, user2) edge graph
	 * 
	 * @return JavaPairRDD: (user: String, user: String)
	 */
	JavaPairRDD<String, String> getFriends() {
		AmazonDynamoDB db2 = AmazonDynamoDBClientBuilder.standard()
					.withEndpointConfiguration(new AwsClientBuilder.EndpointConfiguration(
						Config.DYNAMODB_URL, "us-east-1"))
        			.withCredentials(new DefaultAWSCredentialsProviderChain())
					.build(); 

		HashMap<String, AttributeValue> map = new HashMap<>();
		// map.put(":u", new AttributeValue("FRIEND"));
		map.put(":u", new AttributeValue("FRIEND"));
		HashMap<String, String> map2 = new HashMap<>();
		map2.put("#U", "user_relation");
		ScanRequest scanRequest = new ScanRequest()
			.withTableName("users")
			.withFilterExpression("begins_with(#U, :u)")
			// .withFilterExpression("#U = :u")
			.withExpressionAttributeNames(map2)
			.withExpressionAttributeValues(map);

		ArrayList<String[]> arr = new ArrayList<>();
		ScanResult result = db2.scan(scanRequest);
		for (Map<String, AttributeValue> item : result.getItems()){
			// String[] temp = new String[]{item.get("id").getS(), item.get("friend").getS()};
			String[] temp = new String[]{item.get("id").getS(), item.get("user_relation").getS().substring(7)};
			arr.add(temp);
		}

		// BatchGetItemSpec b = new BatchGetItemSpec()
		// 	.withTableKeysAndAttributes(new TableKeysAndAttributes("users"))
		// db.batchGetItem()

		// arr now has all friends

		// Read into RDD with lines as strings
		JavaRDD<String[]> file = context.parallelize(arr);
		
		// convert to pair rdd, first val is node, second is follower
		JavaPairRDD<String, String> friends = file.mapToPair(x -> {return new Tuple2<String, String>(
				x[0], x[1]);
		});

		return friends;
	}

	/**
	 * Fetch the interests from user database, and create a (user, category) edge graph
	 * 
	 * @return JavaPairRDD: (user: String, category: String)
	 */
	JavaPairRDD<String, String> getUserToCategory() {

		AmazonDynamoDB db2 = AmazonDynamoDBClientBuilder.standard()
					.withEndpointConfiguration(new AwsClientBuilder.EndpointConfiguration(
						Config.DYNAMODB_URL, "us-east-1"))
        			.withCredentials(new DefaultAWSCredentialsProviderChain())
					.build(); 

		HashMap<String, AttributeValue> map = new HashMap<>();
		map.put(":u", new AttributeValue("user"));
		HashMap<String, String> map2 = new HashMap<>();
		map2.put("#U", "user_relation");
		ScanRequest scanRequest = new ScanRequest()
			.withTableName("users")
			.withFilterExpression("#U = :u")
			.withExpressionAttributeNames(map2)
			.withExpressionAttributeValues(map);		// has to be a map

			// .withExpressionAttributeNames("#U", "user_relation")

		// ScanRequest scanRequest = new ScanRequest()
		// 	.withTableName("users")
		// 	.withKeyConditionExpression("begins_with(user_relation, :u)")
		// 	.withValueMap(new ValueMap()
		// 				.withString(":u", "user")
		// 	);

		ArrayList<String[]> arr = new ArrayList<>();
		ScanResult result = db2.scan(scanRequest);
		for (Map<String, AttributeValue> item : result.getItems()){
			List<String> set = item.get("interests").getSS();
			for (String s : set) {
				String[] temp = new String[]{item.get("id").getS(), s.toLowerCase()};
				arr.add(temp);
			}
		}
		// arr now has all user, category pairs

		// Read into RDD with lines as strings
		JavaRDD<String[]> file = context.parallelize(arr);
		
		// convert to pair rdd, first val is user, second is category
		JavaPairRDD<String, String> interests = file.mapToPair(x -> {return new Tuple2<String, String>(
				x[0], x[1]);
		});

		return interests;
	}

	/**
	 * Fetch the interests from user database, and create a (user, category) edge graph
	 * 
	 * @return JavaPairRDD: (user: String, category: String)
	 */
	JavaPairRDD<String, String> getCategoryToUser() {

		AmazonDynamoDB db2 = AmazonDynamoDBClientBuilder.standard()
					.withEndpointConfiguration(new AwsClientBuilder.EndpointConfiguration(
						Config.DYNAMODB_URL, "us-east-1"))
        			.withCredentials(new DefaultAWSCredentialsProviderChain())
					.build(); 

		// ScanRequest scanRequest = new ScanRequest()
		// 	.withTableName("users")
		// 	.withFilterExpression("user_relation = user");

		HashMap<String, AttributeValue> map = new HashMap<>();
		map.put(":u", new AttributeValue("user"));
		HashMap<String, String> map2 = new HashMap<>();
		map2.put("#U", "user_relation");
		ScanRequest scanRequest = new ScanRequest()
			.withTableName("users")
			.withFilterExpression("#U = :u")
			.withExpressionAttributeNames(map2)
			.withExpressionAttributeValues(map);

		// ScanRequest scanRequest = new ScanRequest()
		// 	.withTableName("users")
		// 	.withKeyConditionExpression("begins_with(user_relation, :u)")
		// 	.withValueMap(new ValueMap()
		// 				.withString(":u", "user")
		// 	);

		ArrayList<String[]> arr = new ArrayList<>();
		ScanResult result = db2.scan(scanRequest);
		for (Map<String, AttributeValue> item : result.getItems()){
			List<String> set = item.get("interests").getSS();
			for (String s : set) {
				String[] temp = new String[]{s.toLowerCase(), item.get("id").getS()};
				arr.add(temp);
			}
		}
		// arr now has all user, category pairs

		// Read into RDD with lines as strings
		JavaRDD<String[]> file = context.parallelize(arr);
		
		// convert to pair rdd, first val is category, second is user
		JavaPairRDD<String, String> interests = file.mapToPair(x -> {return new Tuple2<String, String>(
				x[0], x[1]);
		});

		return interests;
	}

	/**
	 * Fetch the liked articles from user database, and create a (user, article) edge graph
	 * 
	 * @return JavaPairRDD: (user: String, article: String) (turn article id (int) into a string)
	 */
	JavaPairRDD<String, String> getUserToArticle() {

		AmazonDynamoDB db2 = AmazonDynamoDBClientBuilder.standard()
					.withEndpointConfiguration(new AwsClientBuilder.EndpointConfiguration(
						Config.DYNAMODB_URL, "us-east-1"))
        			.withCredentials(new DefaultAWSCredentialsProviderChain())
					.build(); 

		HashMap<String, AttributeValue> map = new HashMap<>();
		map.put(":l", new AttributeValue("articlelike"));
		ScanRequest scanRequest = new ScanRequest()
			.withTableName("users")
			.withFilterExpression("begins_with(user_relation, :l)") // LIKE#
			.withExpressionAttributeValues(map); 

		// ScanRequest scanRequest = new ScanRequest()
		// 	.withTableName("users")
		// 	.withKeyConditionExpression("begins_with(user_relation, :a)")
		// 	.withValueMap(new ValueMap()
		// 				.withString(":a", "LIKE#")
		// 	);

// 12
		ArrayList<String[]> arr = new ArrayList<>();
		ScanResult result = db2.scan(scanRequest);
		for (Map<String, AttributeValue> item : result.getItems()){
			String s = item.get("user_relation").getS().substring(12);
			String[] temp = new String[]{item.get("id").getS(), s};
			arr.add(temp);
		}
		// arr now has all user, article pairs

		// Read into RDD with lines as strings
		JavaRDD<String[]> file = context.parallelize(arr);
		
		// convert to pair rdd, first val is category, second is user
		JavaPairRDD<String, String> articles = file.mapToPair(x -> {return new Tuple2<String, String>(
				x[0], x[1]);
		});

		return articles;
	}

	/**
	 * Fetch the liked articles from user database, and create a (user, article) edge graph
	 * 
	 * @return JavaPairRDD: (user: String, article: String) (turn article id (int) into a string)
	 */
	JavaPairRDD<String, String> getArticleToUser() {

		AmazonDynamoDB db2 = AmazonDynamoDBClientBuilder.standard()
					.withEndpointConfiguration(new AwsClientBuilder.EndpointConfiguration(
						Config.DYNAMODB_URL, "us-east-1"))
        			.withCredentials(new DefaultAWSCredentialsProviderChain())
					.build(); 

		HashMap<String, AttributeValue> map = new HashMap<>();
		map.put(":l", new AttributeValue("articlelike"));
		ScanRequest scanRequest = new ScanRequest()
			.withTableName("users")
			.withFilterExpression("begins_with(user_relation, :l)") // LIKE#
			.withExpressionAttributeValues(map); 

		// ScanRequest scanRequest = new ScanRequest()
		// 	.withTableName("users")
		// 	.withKeyConditionExpression("begins_with(user_relation, :a)")
		// 	.withValueMap(new ValueMap()
		// 				.withString(":a", "LIKE#")
		// 	);

		ArrayList<String[]> arr = new ArrayList<>();
		ScanResult result = db2.scan(scanRequest);
		for (Map<String, AttributeValue> item : result.getItems()){
			String s = item.get("user_relation").getS().substring(12);
			String[] temp = new String[]{item.get("id").getS(), s};
			arr.add(temp);
		}
		// arr now has all user, article pairs

		// Read into RDD with lines as strings
		JavaRDD<String[]> file = context.parallelize(arr);
		
		// convert to pair rdd, first val is category, second is user
		JavaPairRDD<String, String> articles = file.mapToPair(x -> {return new Tuple2<String, String>(
				x[1], x[0]);
		});

		return articles;
	}

	/**
	 * Main functionality in the program: read and process the social network
	 * 
	 * @throws IOException File read, network, and other errors
	 * @throws DynamoDbException DynamoDB is unhappy with something
	 * @throws InterruptedException User presses Ctrl-C
	 */
	public String run() throws IOException, InterruptedException {
		System.out.println("Running");

		// load category and article edges
		// JavaPairRDD<String, String> aToC = getArticleToCategory(Config.NEWS_FILE);
		// JavaPairRDD<String, String> cToA = getCategoryToArticle(Config.NEWS_FILE);
		JavaPairRDD<String, String> aToC = getArticleToCategory();
		JavaPairRDD<String, String> cToA = getCategoryToArticle();

		// load user and category edges
		JavaPairRDD<String, String> uToC = getUserToCategory();
		// System.out.println("UC: " + uToC.collect());
		JavaPairRDD<String, String> cToU = getCategoryToUser();
		// System.out.println("CU: " + cToU.collect());

		// load user and article edges
		JavaPairRDD<String, String> uToA = getUserToArticle();
		// System.out.println("UA: " + uToA.collect());
		JavaPairRDD<String, String> aToU = getArticleToUser();
		// System.out.println("AU: " + aToU.collect());

		// load user and user edges
		JavaPairRDD<String, String> uToU = getFriends();
		// System.out.println("UU: " + uToU.collect());

		// all outgoing edges from category & articles
		JavaPairRDD<String, String> cTo = cToU.union(cToA);
		JavaPairRDD<String, String> aTo = aToU.union(aToC);

		JavaPairRDD<String, String> edgeRDD = aToC.union(cToA).union(uToC).union(cToU).union(uToA).union(aToU).union(uToU);

		// compute adsorption
		// preparing for adsorption

		double init = 1.0;
		// users start with 1.0

		// find number of neighbors of each node (for each type of node)
		// users (gives user name and the value to send to each friend)
		JavaPairRDD<String, Double> uU_TransferRDD = uToU
			.mapToPair(item -> new Tuple2<String, Double>(item._1, 1.0)) // count number of neighbors
			.reduceByKey((a, b) -> a + b) // N_b
			.mapToPair(item -> new Tuple2<String, Double>(item._1, 0.3 / item._2)); // send friends 0.3
		// uU_TransferRDD = uToU.join(uU_TransferRDD);
		
		JavaPairRDD<String, Tuple2<String, Double>> uuLabel = uToU.join(uU_TransferRDD);

		// user to article
		// (user name and value to send to each article)
		JavaPairRDD<String, Double> uA_TransferRDD = uToA
			.mapToPair(item -> new Tuple2<String, Double>(item._1, 1.0)) // count number of neighbors
			.reduceByKey((a, b) -> a + b) // N_b
			.mapToPair(item -> new Tuple2<String, Double>(item._1, 0.4 / item._2)); // send articles 0.4
		// System.out.println("UA: " + uA_TransferRDD.collect());

		// user to category
		// (user name and value to send to each category)
		JavaPairRDD<String, Double> uC_TransferRDD = uToC
			.mapToPair(item -> new Tuple2<String, Double>(item._1, 1.0)) // count number of neighbors
			.reduceByKey((a, b) -> a + b) // N_b
			.mapToPair(item -> new Tuple2<String, Double>(item._1, 0.3 / item._2)); // send categories 0.3
		// System.out.println("UC: " + uC_TransferRDD.collect());

		// category to all
		JavaPairRDD<String, Double> c_TransferRDD = cTo
			.mapToPair(item -> new Tuple2<String, Double>(item._1, 1.0)) // count number of neighbors
			.reduceByKey((a, b) -> a + b) // N_b
			.mapToPair(item -> new Tuple2<String, Double>(item._1, 1.0 / item._2)); // send users & articles 1/# neighbors

		// article to all
		JavaPairRDD<String, Double> a_TransferRDD = aTo
			.mapToPair(item -> new Tuple2<String, Double>(item._1, 1.0)) // count number of neighbors
			.reduceByKey((a, b) -> a + b) // N_b
			.mapToPair(item -> new Tuple2<String, Double>(item._1, 1.0 / item._2)); // send users & category 1/# neighbors

		// all entities and weights
		// JavaPairRDD<String, Double> nodeTransferRDD = uU_TransferRDD.union(uA_TransferRDD).union(uC_TransferRDD);
		// System.out.println(nodeTransferRDD.collect());

		// join edges and their weights (b, p, x * 1/N_b)
		// node, node, edge weight
		// joins all edges with all entity/weight relationships - cross multiply which is wrong
		// JavaPairRDD<String, Tuple2<String, Double>> edgeTransferRDD = edgeRDD.join(nodeTransferRDD);
		
		// node, (node, edge weight)
		JavaPairRDD<String, Tuple2<String, Double>> uuWeight = uToU.join(uU_TransferRDD);
		JavaPairRDD<String, Tuple2<String, Double>> uaWeight = uToA.join(uA_TransferRDD);
		JavaPairRDD<String, Tuple2<String, Double>> ucWeight = uToC.join(uC_TransferRDD);
		JavaPairRDD<String, Tuple2<String, Double>> cWeight = cTo.join(c_TransferRDD);
		JavaPairRDD<String, Tuple2<String, Double>> aWeight = aTo.join(a_TransferRDD);
		// // all edges and weights in the whole graph
		JavaPairRDD<String, Tuple2<String, Double>> edgeTransferRDD = uuWeight.union(uaWeight).union(ucWeight)
			.union(cWeight).union(aWeight);
		System.out.println(aWeight.take(30));
		// System.out.println(cWeight.collect());
		// System.out.println(edgeTransferRDD.collect());

		/*
		iteration of page rank
		*/
		int maxIters = 15;
		double delta = 0.001;

		// each user starts with 1.0 of their own label (u, u, 1.0)
		JavaPairRDD<String, Tuple2<String, Double>> rankRDD = uToC.mapToPair(item -> new Tuple2<String, Tuple2<String, Double>>
			(item._1, new Tuple2<String, Double>(item._1, 1.0))).distinct();

		for (int i = 0; i < maxIters; i++) {
			System.out.println("iteration: " + i);
			// [b, p, u, val]
			// (node, (node, (label_name, label_value)))
			JavaPairRDD<String, Tuple2<String, Tuple2<String, Double>>> propagateRDD = edgeTransferRDD
				// (b, [(p, x * 1/N_b), (u, 1.0))])
				.join(rankRDD) // joins edges FROM user TO all else
				.mapToPair(item -> new Tuple2<String, Tuple2<String, Tuple2<String, Double>>>
					(item._1, new Tuple2<>(item._2._1._1, new Tuple2<>(item._2._2._1, item._2._2._2 * item._2._1._2))));
			// System.out.println(propagateRDD.take(5));

			// (p, (u, val))
			// (node, (label_name, label_value))
			rankRDD = propagateRDD.mapToPair(item -> new Tuple2<String, Tuple2<String, Double>>
				(item._2._1, new Tuple2<>(item._2._2._1, item._2._2._2)));
			// System.out.println(rankRDD.take(10));

			// sum up all of them with same label
			// ((p, u), val)
			JavaPairRDD<Tuple2<String, String>, Double> temp = rankRDD
				.mapToPair(item -> new Tuple2<Tuple2<String, String>, Double> // ((node, label_name), label_value)
					(new Tuple2<>(item._1, item._2._1), item._2._2))
				.reduceByKey((a, b) -> a + b); // ((p, u), val) add up all values
				
			// temp = temp.mapToPair(item -> new Tuple2<String, Tuple2<String, Double>>(item._1._1, new Tuple2<>(item._1._2, item._2)));

			// normalize
			// ((p, u), sum)
			// all the ones with same label EVERYWHERE need to sum up
			JavaPairRDD<String, Double> label = temp
				.mapToPair(item -> new Tuple2<String, Double>(item._1._2, item._2)) // label name and value
				.reduceByKey((a, b) -> a + b); // label name and total sum of all label values for that label
			// System.out.println(label.take(10));
			
			// (node, (label_name, label_value))
			JavaPairRDD<String, Tuple2<String, Double>> rankRDD2 = temp
				.mapToPair(item -> new Tuple2<String, Tuple2<String, Double>>(item._1._2, new Tuple2<>(item._1._1, item._2))) // (u, (p, val))
				.join(label) // (u, ((p, val), sum))
				.mapToPair(item -> new Tuple2<String, Tuple2<String, Double>>(item._2._1._1, new Tuple2<>(item._1, item._2._1._2 / item._2._2)));
				// (p, (u, val)) normalized

			// remove label nodes on users that match the user
			// add in 1.0 for users own labels
			rankRDD2 = rankRDD2.filter(item -> !(item._1.equals(item._2._1)));
			JavaPairRDD<String, Tuple2<String, Double>> initUser = uToC.mapToPair(item -> new Tuple2<String, Tuple2<String, Double>>
			(item._1, new Tuple2<String, Double>(item._1, 1.0))).distinct();
			rankRDD2 = rankRDD2.union(initUser);
			// System.out.println(initUser.collect());

			// drop labels less than certain value
			double min = 0.0001;
			rankRDD2 = rankRDD2.filter(item -> item._2._2 > min);

			// check for convergence
			// (p , (u , val))
			JavaPairRDD<String, Tuple2<String, Double>> difference = rankRDD2
				.join(rankRDD)
				.mapToPair(item -> new Tuple2<String, Tuple2<String, Double>>
				(item._1, new Tuple2<String, Double>(item._2._1._1, Math.abs(item._2._1._2 - item._2._2._2))));

			rankRDD = rankRDD2;
			// System.out.println(rankRDD.take(10));
			if (i != 0) {
				Double currMax = difference
				.join(aToC) // (p, ((u, val), category))
				.mapToPair(item -> new Tuple2<String, Tuple2<String, Double>>(item._1, item._2._1)) // only articles
				.mapToPair(item -> new Tuple2<Tuple2<String, String>, Double>
					(new Tuple2<>(item._1, item._2._1), item._2._2)) // ((p, u), val)
				.mapToPair(x -> x.swap()) // (val, (p, u))
				.sortByKey(false) // sort by differences
				.take(1) //get first
				.get(0) // first value in list
				._1;

				if (currMax <= delta) {
					break;
				}
			}
			
		}
		
		rankRDD = rankRDD
			.join(aToC) // (p, ((u, val), category))
			.mapToPair(item -> new Tuple2<String, Tuple2<String, Double>>(item._1, item._2._1)); // only articles
		// System.out.println(rankRDD.collect());

		writeToDb(rankRDD);

		System.out.println("*** Finished social network ranking! ***");
		return "Success";
	}

	public static void writeToDb(JavaPairRDD<String, Tuple2<String, Double>> rdd) {
		// System.out.println(rdd.collect());
		
		rdd.foreachPartition(iter -> {

			DynamoDB db = DynamoConnector.getConnection(Config.DYNAMODB_URL);

			HashSet<Item> itemSet = new HashSet<>();

				while(iter.hasNext()) {
					Tuple2<String, Tuple2<String, Double>> next = iter.next();
					Item item = new Item()
							.withPrimaryKey("user", next._2._1, "article_id", next._1)
							.withNumber("article_rank", next._2._2);
					if (itemSet.size() >= 25) {
						TableWriteItems twi = new TableWriteItems("recs");
						twi.withItemsToPut(itemSet);
						BatchWriteItemOutcome unpr = db.batchWriteItem(twi);
						// System.out.println("write");
						// keep writing until nothing is unprocessed
						while (unpr.getUnprocessedItems().size() != 0) {
							unpr = db.batchWriteItemUnprocessed(unpr.getUnprocessedItems());
						}
						itemSet.clear();
					} 
					itemSet.add(item);
				}
						
				// final write for any remaining words if 25 threshold wasn't reached earlier
				if (!itemSet.isEmpty()) {
					TableWriteItems twi = new TableWriteItems("recs");
					twi.withItemsToPut(itemSet);
					BatchWriteItemOutcome unpr = db.batchWriteItem(twi);
					while (unpr.getUnprocessedItems().size() != 0) {
						unpr = db.batchWriteItemUnprocessed(unpr.getUnprocessedItems());
					}
				}
		});
	}

	// /**
	//  * Graceful shutdown
	//  */
	// public void shutdown() {
	// 	System.out.println("Shutting down");
	// }
	
	public SocialRankJob(String filepath) {
		System.setProperty("file.encoding", "UTF-8");
		
		this.source = filepath;
	}

	@Override
	public String call(JobContext arg0) throws Exception {
		initialize();
		return run();
	}

}
